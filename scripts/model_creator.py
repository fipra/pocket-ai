"""Local, randomly initialized decoder-only Transformer for Model Creator Lab.

No pretrained model or tokenizer is loaded. All paths are provided by the local
server, never directly by the browser. Checkpoints are local trusted files.
"""
import argparse
import csv
import io
import json
import math
import os
import random
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import torch
from torch import nn
from torch.nn import functional as F

PAD, QUESTION, ANSWER, END = 256, 257, 258, 259
PRESETS = {
    'tiny': dict(vocab_size=260, dim=64, layers=2, heads=4, context=128),
    'small': dict(vocab_size=260, dim=192, layers=4, heads=6, context=128),
    'medium': dict(vocab_size=260, dim=384, layers=8, heads=6, context=256),
}

@dataclass
class Config:
    vocab_size: int = 260
    dim: int = 64
    layers: int = 2
    heads: int = 4
    context: int = 128
    dropout: float = 0.1

    def validate(self):
        if not (260 <= self.vocab_size <= 8192 and 16 <= self.dim <= 768 and 1 <= self.layers <= 12 and 1 <= self.heads <= 16 and self.dim % self.heads == 0 and 16 <= self.context <= 512 and 0 <= self.dropout <= .5):
            raise ValueError('Invalid architecture: check vocabulary, dimensions, heads, context and dropout.')
        if parameter_count(self) > 40_000_000:
            raise ValueError('This architecture exceeds the 40 million parameter safety limit.')


def parameter_count(c):
    # Embeddings; per-block QKV, output, two layer norms and MLP; final norm and head.
    d = c.dim
    return c.vocab_size * d + c.context * d + c.layers * (12*d*d + 13*d) + 2*d + c.vocab_size*d


def memory_estimate(c, batch):
    # Conservative rough estimate; allocator, backend and dataset can change actual usage.
    return int(parameter_count(c) * 20 + batch * c.context * c.dim * c.layers * 64 + 256_000_000)


class ByteTokenizer:
    """Dataset-ordered UTF-8 bytes plus conversation markers; no remote assets."""
    def __init__(self, byte_order=None):
        self.byte_order = list(range(256)) if byte_order is None else list(byte_order)
        if sorted(self.byte_order) != list(range(256)):
            raise ValueError('Invalid tokenizer vocabulary.')
        self.byte_ids = {byte: index for index, byte in enumerate(self.byte_order)}

    @classmethod
    def from_rows(cls, rows):
        counts = [0] * 256
        for row in rows:
            for value in row.values():
                for byte in value.encode('utf-8'): counts[byte] += 1
        return cls(sorted(range(256), key=lambda byte: (-counts[byte], byte)))

    def encode(self, text):
        return [self.byte_ids[byte] for byte in text.encode('utf-8')]

    def decode(self, ids):
        return bytes(self.byte_order[i] for i in ids if 0 <= i < 256).decode('utf-8', errors='replace')

    def spec(self):
        return {'type': 'utf8-byte-v1', 'byte_order':self.byte_order, 'pad': PAD, 'question': QUESTION, 'answer': ANSWER, 'end': END}


class Attention(nn.Module):
    def __init__(self, c):
        super().__init__()
        self.heads = c.heads
        self.dim = c.dim
        self.qkv = nn.Linear(c.dim, 3*c.dim)
        self.proj = nn.Linear(c.dim, c.dim)
        self.dropout = nn.Dropout(c.dropout)
        self.register_buffer('mask', torch.tril(torch.ones(c.context, c.context, dtype=torch.bool)), persistent=False)

    def forward(self, x):
        b, t, d = x.shape
        q, k, v = self.qkv(x).chunk(3, dim=-1)
        q, k, v = (a.view(b, t, self.heads, d // self.heads).transpose(1, 2) for a in (q,k,v))
        score = (q @ k.transpose(-2,-1)) / math.sqrt(d // self.heads)
        score = score.masked_fill(~self.mask[:t, :t], float('-inf'))
        weights = self.dropout(F.softmax(score, dim=-1))
        return self.dropout(self.proj((weights @ v).transpose(1,2).contiguous().view(b,t,d)))


class Block(nn.Module):
    def __init__(self, c):
        super().__init__()
        self.norm1, self.norm2 = nn.LayerNorm(c.dim), nn.LayerNorm(c.dim)
        self.attention = Attention(c)
        self.mlp = nn.Sequential(nn.Linear(c.dim, 4*c.dim), nn.GELU(), nn.Linear(4*c.dim, c.dim), nn.Dropout(c.dropout))

    def forward(self, x):
        x = x + self.attention(self.norm1(x))
        return x + self.mlp(self.norm2(x))


class Transformer(nn.Module):
    def __init__(self, c):
        super().__init__()
        c.validate()
        self.config = c
        self.token = nn.Embedding(c.vocab_size, c.dim)
        self.position = nn.Embedding(c.context, c.dim)
        self.blocks = nn.Sequential(*(Block(c) for _ in range(c.layers)))
        self.norm = nn.LayerNorm(c.dim)
        self.head = nn.Linear(c.dim, c.vocab_size, bias=False)
        self.apply(self.init_weights)

    @staticmethod
    def init_weights(module):
        if isinstance(module, (nn.Linear, nn.Embedding)):
            nn.init.normal_(module.weight, mean=0, std=.02)
            if isinstance(module, nn.Linear) and module.bias is not None:
                nn.init.zeros_(module.bias)

    def forward(self, tokens, targets=None):
        if tokens.ndim != 2 or tokens.shape[1] > self.config.context:
            raise ValueError('Invalid token dimensions or context length.')
        x = self.token(tokens) + self.position(torch.arange(tokens.shape[1], device=tokens.device))
        logits = self.head(self.norm(self.blocks(x)))
        loss = None if targets is None else F.cross_entropy(logits.reshape(-1, logits.shape[-1]), targets.reshape(-1), ignore_index=-100)
        return logits, loss


def parse_dataset(raw, extension, mode):
    if len(raw.encode('utf-8')) > 2_000_000:
        raise ValueError('Dataset exceeds 2 MB.')
    if mode not in ('lm', 'qa'):
        raise ValueError('Choose language modeling or question and answer.')
    if extension == 'txt':
        lines = [line.strip() for line in raw.splitlines() if line.strip()]
        if mode == 'qa':
            if any('\t' not in line for line in lines): raise ValueError('For Q&A TXT, use one question and answer separated by a tab per line.')
            values = [dict(zip(('question','answer'), line.split('\t',1))) for line in lines]
        else: values = lines
    elif extension == 'json':
        values = json.loads(raw)
        if isinstance(values, dict): values = values.get('examples', values.get('data'))
    elif extension == 'jsonl':
        values = [json.loads(line) for line in raw.splitlines() if line.strip()]
    elif extension == 'csv':
        values = list(csv.DictReader(io.StringIO(raw)))
    else:
        raise ValueError('Supported files: TXT, CSV, JSON and JSONL.')
    if not isinstance(values, list) or len(values) < 3 or len(values) > 10000:
        raise ValueError('Provide between 3 and 10,000 examples.')
    rows = []
    for value in values:
        if mode == 'qa':
            if not isinstance(value, dict): raise ValueError('Q&A requires question and answer fields.')
            q, a = value.get('question', value.get('prompt')), value.get('answer', value.get('completion'))
            if not isinstance(q, str) or not isinstance(a, str) or not q.strip() or not a.strip():
                raise ValueError('Every Q&A example needs a non-empty question and answer.')
            rows.append({'question': q.strip(), 'answer': a.strip()})
        else:
            text = value.get('text') if isinstance(value, dict) else value
            if not isinstance(text, str) or not text.strip(): raise ValueError('Every language example needs non-empty text.')
            rows.append({'text': text.strip()})
    return rows


def row_key(row):
    return json.dumps(row, ensure_ascii=False, sort_keys=True).casefold()


def split_rows(rows, seed):
    # Keep duplicate examples and identical questions together in one split.
    groups = {}
    for row in rows:
        key = row.get('question', row.get('text', '')).strip().casefold()
        groups.setdefault(key, []).append(row)
    if len(groups) < 3: raise ValueError('At least three distinct questions or text examples are required.')
    keys = list(groups)
    random.Random(seed).shuffle(keys)
    n = max(1, len(keys)//5)
    validation = [row for key in keys[:n] for row in groups[key]]
    train = [row for key in keys[n:] for row in groups[key]]
    duplicates = len(rows) - len({row_key(row) for row in rows})
    return train, validation, duplicates


def encode_row(row, tokenizer, context):
    if 'question' in row:
        prefix = [QUESTION] + tokenizer.encode(row['question']) + [ANSWER]
        answer = tokenizer.encode(row['answer']) + [END]
        if len(prefix) + len(answer) > context + 1:
            raise ValueError('A question and answer exceed the selected context; increase context or shorten examples.')
        ids = prefix + answer
        target = [-100] * (len(prefix)-1) + answer
    else:
        ids = tokenizer.encode(row['text']) + [END]
        if len(ids) > context + 1: raise ValueError('A text example exceeds the selected context; increase context or shorten it.')
        target = ids[1:]
    if len(ids) < 2: raise ValueError('An example is too short.')
    return ids[:-1], target


def batch_rows(rows, tokenizer, context, device):
    encoded = [encode_row(row, tokenizer, context) for row in rows]
    length = max(len(x) for x, _ in encoded)
    x = torch.full((len(rows), length), PAD, dtype=torch.long, device=device)
    y = torch.full((len(rows), length), -100, dtype=torch.long, device=device)
    for i, (inputs, targets) in enumerate(encoded):
        x[i, :len(inputs)] = torch.tensor(inputs, dtype=torch.long, device=device)
        y[i, :len(targets)] = torch.tensor(targets, dtype=torch.long, device=device)
    return x, y


def device_for(name):
    if name == 'cpu': return torch.device('cpu')
    if name == 'cuda' and torch.cuda.is_available(): return torch.device('cuda')
    if name == 'mps' and torch.backends.mps.is_available(): return torch.device('mps')
    raise ValueError(f'Requested device {name} is unavailable; choose an available device.')


def atomic_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    os.replace(tmp, path)


def save_checkpoint(path, model, optimizer, config, tokenizer, training, splits):
    path = Path(path)
    temp = path.with_suffix('.tmp')
    torch.save({'version':1, 'config':asdict(config), 'tokenizer':tokenizer.spec(), 'model':model.state_dict(),
                'optimizer':optimizer.state_dict(), 'training':training, 'splits':splits,
                'torch_rng':torch.get_rng_state()}, temp)
    os.replace(temp, path)


def load_checkpoint(path, device):
    data = torch.load(path, map_location='cpu', weights_only=True)
    if data.get('version') != 1 or data.get('tokenizer', {}).get('type') != 'utf8-byte-v1': raise ValueError('Unsupported checkpoint format.')
    c = Config(**data['config']); c.validate()
    model = Transformer(c).to(device)
    model.load_state_dict(data['model'], strict=True)
    return model, data


def generate(model, tokenizer, prompt, device, temperature=.8, top_k=40, top_p=.9, max_tokens=100, seed=42, mode='qa'):
    if not (0 <= temperature <= 3 and 1 <= top_k <= model.config.vocab_size and 0 < top_p <= 1 and 1 <= max_tokens <= 512):
        raise ValueError('Invalid generation settings.')
    ids = ([QUESTION] + tokenizer.encode(prompt) + [ANSWER]) if mode == 'qa' else tokenizer.encode(prompt)
    if not ids: raise ValueError('Enter a prompt.')
    generator = torch.Generator(device='cpu').manual_seed(seed)
    model.eval(); generated = []; start = time.monotonic()
    with torch.inference_mode():
        for _ in range(max_tokens):
            x = torch.tensor([ids[-model.config.context:]], dtype=torch.long, device=device)
            logits, _ = model(x)
            scores = logits[0,-1].float().cpu()
            scores[PAD] = scores[QUESTION] = scores[ANSWER] = float('-inf')
            scores[260:] = float('-inf')
            if temperature == 0:
                token = int(scores.argmax())
            else:
                scores /= temperature
                cutoff = torch.topk(scores, min(top_k, scores.numel())).values[-1]
                scores[scores < cutoff] = float('-inf')
                sorted_scores, indices = torch.sort(scores, descending=True)
                probs = F.softmax(sorted_scores, dim=-1)
                remove = torch.cumsum(probs, dim=-1) - probs >= top_p
                sorted_scores[remove] = float('-inf')
                probs = F.softmax(sorted_scores, dim=-1)
                token = int(indices[torch.multinomial(probs, 1, generator=generator)])
            if token == END: break
            ids.append(token); generated.append(token)
    elapsed = max(time.monotonic()-start, .000001)
    return {'text':tokenizer.decode(generated), 'tokens':len(generated), 'tokensPerSecond':len(generated)/elapsed}


def train(request, output):
    c = Config(**request['config']); c.validate()
    epochs, batch_size = int(request['epochs']), int(request['batch_size'])
    lr, seed = float(request['learning_rate']), int(request['seed'])
    if not (1 <= epochs <= 1000 and 1 <= batch_size <= 64 and 1e-6 <= lr <= .02 and 0 <= seed < 2**32): raise ValueError('Invalid training settings.')
    if memory_estimate(c, batch_size) > 6_000_000_000:
        raise ValueError('Estimated training memory exceeds the 6 GB safety limit. Reduce batch size, context or model size.')
    device = device_for(request['device']); torch.manual_seed(seed)
    if device.type == 'cpu': torch.set_num_threads(min(4, max(1, os.cpu_count() or 1)))
    if device.type == 'cuda': torch.cuda.manual_seed_all(seed)
    rows = request['rows']; training, validation, duplicates = split_rows(rows, seed)
    tokenizer = ByteTokenizer.from_rows(training)
    for row in rows: encode_row(row, tokenizer, c.context)
    model = Transformer(c).to(device)
    actual = sum(p.numel() for p in model.parameters())
    if actual != parameter_count(c): raise RuntimeError('Parameter estimate does not match architecture.')
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    checkpoint = output / 'checkpoint.pt'
    start_epoch = 0; history = []
    if request.get('resume'):
        model, saved = load_checkpoint(checkpoint, device)
        if saved['config'] != asdict(c) or saved['splits'] != {'train':training,'validation':validation}: raise ValueError('Checkpoint configuration or dataset differs.')
        tokenizer = ByteTokenizer(saved['tokenizer']['byte_order'])
        optimizer = torch.optim.AdamW(model.parameters(), lr=lr); optimizer.load_state_dict(saved['optimizer'])
        for group in optimizer.param_groups: group['lr'] = lr
        start_epoch = int(saved['training']['epoch']); history = saved['training'].get('history', [])
        if start_epoch >= epochs:
            raise ValueError('For resume, set total epochs above the last completed epoch.')
        torch.set_rng_state(saved['torch_rng'])
    start = time.monotonic(); best = float('inf'); stale = 0
    total_steps = epochs * math.ceil(len(training)/batch_size)
    status_path = output / 'status.json'
    for epoch in range(start_epoch, epochs):
        order = list(training); random.Random(seed+epoch).shuffle(order)
        for offset in range(0, len(order), batch_size):
            model.train(); x,y = batch_rows(order[offset:offset+batch_size], tokenizer,c.context,device)
            optimizer.zero_grad(set_to_none=True); _, loss = model(x,y)
            if not torch.isfinite(loss): raise ValueError('Non-finite training loss; try a lower learning rate.')
            before=model.head.weight.detach().flatten()[:8].float().cpu().tolist()
            loss.backward(); norm = float(torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0).item()); optimizer.step()
            after=model.head.weight.detach().flatten()[:8].float().cpu().tolist()
            step = epoch*math.ceil(len(training)/batch_size)+offset//batch_size+1
            elapsed = time.monotonic()-start
            metric = {'epoch':epoch+1,'step':step,'trainLoss':float(loss.item()),'learningRate':optimizer.param_groups[0]['lr'],'gradientNorm':norm,'elapsedSeconds':elapsed,'etaSeconds':elapsed/max(1, step-start_epoch*math.ceil(len(training)/batch_size))*(total_steps-step),'headBefore':before,'headAfter':after}
            history.append(metric)
            history = history[-2000:]
            atomic_json(status_path, {'phase':'running','device':str(device),'parameters':actual,'metrics':metric,'history':history[-2000:],'duplicates':duplicates})
        model.eval(); losses=[]
        with torch.inference_mode():
            for offset in range(0,len(validation),batch_size):
                x,y=batch_rows(validation[offset:offset+batch_size],tokenizer,c.context,device); _, loss=model(x,y); losses.append(float(loss.item()))
        val = sum(losses)/len(losses); history[-1]['validationLoss']=val
        parameters = torch.cat([p.detach().flatten().float().cpu() for p in model.parameters()])
        history[-1]['parameterMean'] = float(parameters.mean()); history[-1]['parameterStd'] = float(parameters.std())
        sample = validation[0]
        prediction = generate(model, tokenizer, sample.get('question', sample.get('text',''))[:200], device, temperature=0, max_tokens=48, mode=request['mode'])
        history[-1]['examplePrediction'] = prediction['text']
        state={'epoch':epoch+1,'history':history,'mode':request['mode'],'seed':seed,'modelName':request['name'],'device':str(device)}
        save_checkpoint(checkpoint,model,optimizer,c,tokenizer,state,{'train':training,'validation':validation})
        atomic_json(status_path, {'phase':'running','device':str(device),'parameters':actual,'metrics':history[-1],'history':history[-2000:],'duplicates':duplicates})
        if val < best-1e-5: best=val; stale=0
        else: stale+=1
        if request.get('early_stopping') and stale >= int(request.get('patience',5)): break
    atomic_json(status_path, {'phase':'complete','device':str(device),'parameters':actual,'metrics':history[-1], 'history':history[-2000:], 'duplicates':duplicates,'checkpoint':'checkpoint.pt'})


def evaluate(model, saved, rows, device):
    from difflib import SequenceMatcher
    tokenizer=ByteTokenizer(saved['tokenizer']['byte_order']); c=model.config; model.eval(); total=0; loss_sum=0; exact=0; results=[]
    train=saved['splits']['train']; train_q={r.get('question','').strip().casefold() for r in train if 'question' in r}
    train_pairs={row_key(r) for r in train}
    with torch.inference_mode():
        for row in rows:
            x,y=batch_rows([row],tokenizer,c.context,device); _,loss=model(x,y); n=int((y != -100).sum().item()); loss_sum+=float(loss.item())*n;total+=n
            if 'question' in row:
                prediction=generate(model,tokenizer,row['question'],device,temperature=0,max_tokens=80,mode='qa')['text']
                match=prediction.strip().casefold()==row['answer'].strip().casefold(); exact+=int(match)
                closest = max((r['question'] for r in train if 'question' in r), key=lambda q: SequenceMatcher(None, q.casefold(), row['question'].casefold()).ratio(), default='')
                results.append({'question':row['question'],'expected':row['answer'],'prediction':prediction,'exactMatch':match,'questionSeen':row['question'].strip().casefold() in train_q,'exampleSeen':row_key(row) in train_pairs,'closestTrainingQuestion':closest})
    mean=loss_sum/max(total,1)
    return {'tokenLoss':mean,'perplexity':math.exp(min(mean, 80)), 'exactMatch':exact/len(results) if results else None,'examples':results,'questionOverlaps':sum(e['questionSeen'] for e in results),'exampleOverlaps':sum(row_key(row) in train_pairs for row in rows),'semanticEvaluation':'Not performed. Review meaning manually; exact match is not a semantic score.'}


def export_gguf(checkpoint, output):
    """Export this exact architecture and its dataset-ordered byte vocabulary."""
    try:
        import gguf
    except ModuleNotFoundError as error:
        if error.name != 'gguf': raise
        raise ValueError('GGUF export needs the gguf Python package. Install it in the same Python as PyTorch.') from error
    model, saved = load_checkpoint(checkpoint, torch.device('cpu'))
    c = model.config
    byte_order = saved['tokenizer']['byte_order']
    visible = list(range(33, 127)) + list(range(161, 173)) + list(range(174, 256))
    codepoints = visible[:]
    for byte in range(256):
        if byte not in visible:
            visible.append(byte)
            codepoints.append(256 + len(codepoints) - 188)
    byte_chars = dict(zip(visible, map(chr, codepoints)))
    tokens = [byte_chars[byte] for byte in byte_order]
    tokens += ['<|pad|>', '<|question|>', '<|answer|>', '<|end|>']
    tokens += [f'<|unused{i}|>' for i in range(260, c.vocab_size)]
    tmp = output.with_name(output.name + '.tmp')
    writer = gguf.GGUFWriter(str(tmp), 'gpt2')
    try:
        writer.add_name('LlamaNest Model Creator')
        writer.add_string('llamanest.creator.mode', saved['training']['mode'])
        writer.add_context_length(c.context)
        writer.add_embedding_length(c.dim)
        writer.add_block_count(c.layers)
        writer.add_head_count(c.heads)
        writer.add_feed_forward_length(4*c.dim)
        writer.add_layer_norm_eps(1e-5)
        writer.add_file_type(0)
        writer.add_tokenizer_model('gpt2')
        writer.add_tokenizer_pre('default')
        writer.add_token_list(tokens)
        writer.add_token_types([1]*256 + [3,4,4,3] + [3]*(c.vocab_size-260))
        # llama.cpp requires a merge table. This special-token pair cannot occur
        # in ordinary byte text and does not merge any dataset bytes.
        writer.add_token_merges(['<|pad|> <|pad|>'])
        writer.add_eos_token_id(END)
        writer.add_bos_token_id(END)
        writer.add_pad_token_id(PAD)
        writer.add_add_bos_token(False)
        if saved['training']['mode'] == 'qa':
            template = "{% for message in messages %}{% if message['role'] == 'user' %}{{ '<|question|>' + message['content'] + '<|answer|>' }}{% endif %}{% endfor %}"
        else:
            template = "{% for message in messages %}{% if message['role'] == 'user' %}{{ message['content'] }}{% endif %}{% endfor %}"
        writer.add_chat_template(template)
        names = {'token.weight':'token_embd.weight','position.weight':'position_embd.weight','norm.weight':'output_norm.weight','norm.bias':'output_norm.bias','head.weight':'output.weight'}
        blocks = {'norm1':'attn_norm','attention.qkv':'attn_qkv','attention.proj':'attn_output','norm2':'ffn_norm','mlp.0':'ffn_up','mlp.2':'ffn_down'}
        for key, tensor in model.state_dict().items():
            name = names.get(key)
            if name is None:
                bits = key.split('.')
                name = f"blk.{bits[1]}.{blocks['.'.join(bits[2:-1])]}.{bits[-1]}"
            writer.add_tensor(name, tensor.detach().cpu().float().numpy())
        writer.write_header_to_file(); writer.write_kv_data_to_file(); writer.write_tensors_to_file()
        writer.close()
        tmp.replace(output)
    finally:
        writer.close()
        tmp.unlink(missing_ok=True)
    return {'file':'model.gguf','context':c.context,'mode':saved['training']['mode']}


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('action', choices=['prepare','train','generate','evaluate','devices','export_gguf']);parser.add_argument('--request');parser.add_argument('--output');args=parser.parse_args()
    if args.action == 'devices':
        print(json.dumps({'cpu':True,'cuda':torch.cuda.is_available(),'mps':torch.backends.mps.is_available()})); return
    request=json.loads(Path(args.request).read_text(encoding='utf-8')); output=Path(args.output); output.mkdir(parents=True,exist_ok=True)
    if args.action == 'prepare':
        rows=parse_dataset(request['raw'],request['extension'],request['mode'])
        training,validation,duplicates=split_rows(rows,int(request.get('seed',42)))
        config=Config(**request['config']);config.validate()
        for row in rows: encode_row(row,ByteTokenizer(),config.context)
        atomic_json(output/'dataset.json',{'rows':rows,'mode':request['mode']})
        print(json.dumps({'count':len(rows),'training':len(training),'validation':len(validation),'duplicates':duplicates,'preview':rows[:5]},ensure_ascii=False));return
    if args.action == 'train':
        dataset=json.loads((output/'dataset.json').read_text(encoding='utf-8')); request['rows']=dataset['rows'];request['mode']=dataset['mode'];train(request,output);return
    if args.action == 'export_gguf':
        print(json.dumps(export_gguf(output/'checkpoint.pt', output/'model.gguf'))); return
    device=device_for(request['device']); model,saved=load_checkpoint(output/'checkpoint.pt',device)
    if args.action == 'generate':
        result=generate(model,ByteTokenizer(saved['tokenizer']['byte_order']),request['prompt'],device,temperature=float(request.get('temperature',.8)),top_k=int(request.get('top_k',40)),top_p=float(request.get('top_p',.9)),max_tokens=int(request.get('max_tokens',100)),seed=int(request.get('seed',42)),mode=saved['training']['mode'])
    else:
        rows=parse_dataset(request['raw'],request['extension'],saved['training']['mode']) if request.get('raw') else saved['splits']['validation']
        result=evaluate(model,saved,rows,device)
    print(json.dumps(result,ensure_ascii=False))


if __name__ == '__main__':
    try: main()
    except Exception as error:
        if 'out of memory' in str(error).lower(): print('Out of memory. Reduce batch size, context length or model size.', file=__import__('sys').stderr)
        else: print(str(error), file=__import__('sys').stderr)
        raise SystemExit(1)
