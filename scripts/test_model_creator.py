import json
import tempfile
import unittest
from pathlib import Path

import torch
import model_creator as m

torch.set_num_threads(1)

class CreatorTests(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(7)
        self.c = m.Config(vocab_size=260, dim=32, layers=1, heads=4, context=64, dropout=0)
        self.model = m.Transformer(self.c)
        self.tokenizer = m.ByteTokenizer()

    def test_parameter_count_and_shapes(self):
        self.assertEqual(sum(p.numel() for p in self.model.parameters()), m.parameter_count(self.c))
        logits, loss = self.model(torch.tensor([[1,2,3]]), torch.tensor([[2,3,4]]))
        self.assertEqual(logits.shape, (1,3,260)); self.assertTrue(torch.isfinite(loss))
        for name, c in m.PRESETS.items():
            c = m.Config(**c)
            n = m.parameter_count(c)
            self.assertTrue({'tiny':(100_000,500_000),'small':(1_000_000,5_000_000),'medium':(10_000_000,30_000_000)}[name][0] <= n <= {'tiny':(100_000,500_000),'small':(1_000_000,5_000_000),'medium':(10_000_000,30_000_000)}[name][1])

    def test_causal_mask_and_weight_update(self):
        self.model.eval()
        a,_ = self.model(torch.tensor([[1,2,3,4]])); b,_ = self.model(torch.tensor([[1,2,9,8]]))
        self.assertTrue(torch.allclose(a[:,:2], b[:,:2], atol=1e-6))
        optimizer=torch.optim.AdamW(self.model.parameters(),lr=.01)
        before=self.model.head.weight.detach().clone()
        _,loss=self.model(torch.tensor([[1,2,3]]),torch.tensor([[2,3,4]]));loss.backward();optimizer.step()
        self.assertFalse(torch.equal(before,self.model.head.weight))

    def test_tokenizer_and_mask(self):
        text='Cuore 🫀 café'; self.assertEqual(self.tokenizer.decode(self.tokenizer.encode(text)),text)
        dataset_tokenizer=m.ByteTokenizer.from_rows([{'text':'zzzzzabc'}])
        self.assertEqual(dataset_tokenizer.decode(dataset_tokenizer.encode(text)),text)
        self.assertEqual(dataset_tokenizer.byte_order[0],ord('z'))
        x,y=m.encode_row({'question':'abc','answer':'sì'},self.tokenizer,64)
        self.assertEqual(y[:4],[-100]*4);self.assertEqual(y[-1],m.END);self.assertEqual(len(x),len(y))

    def test_dataset_and_separation(self):
        rows=m.parse_dataset('[{"question":"a","answer":"b"},{"question":"c","answer":"d"},{"question":"e","answer":"f"},{"question":"a","answer":"b"}]','json','qa')
        train,val,duplicates=m.split_rows(rows,4)
        self.assertEqual(duplicates,1)
        self.assertFalse({r['question'] for r in train} & {r['question'] for r in val})
        self.assertEqual(len(m.parse_dataset('text\na\nb\nc\n','csv','lm')),3)
        self.assertEqual(m.parse_dataset('q1\ta1\nq2\ta2\nq3\ta3','txt','qa')[0]['answer'],'a1')
        self.assertEqual(len(m.parse_dataset('{"question":"a","answer":"b"}\n{"question":"c","answer":"d"}\n{"question":"e","answer":"f"}','jsonl','qa')),3)
        with self.assertRaises(ValueError):m.parse_dataset('one\ntwo','txt','lm')
        with self.assertRaises(ValueError):m.device_for('unavailable')

    def test_checkpoint_and_generation(self):
        optim=torch.optim.AdamW(self.model.parameters());
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'checkpoint.pt';m.save_checkpoint(path,self.model,optim,self.c,self.tokenizer,{'epoch':1},{'train':[],'validation':[]})
            loaded,_=m.load_checkpoint(path,torch.device('cpu'))
            for a,b in zip(self.model.parameters(),loaded.parameters()):self.assertTrue(torch.equal(a,b))
            x=m.generate(loaded,self.tokenizer,'abc',torch.device('cpu'),temperature=0,max_tokens=5)
            y=m.generate(loaded,self.tokenizer,'abc',torch.device('cpu'),temperature=0,max_tokens=5)
            self.assertEqual(x['text'],y['text']);self.assertGreaterEqual(x['tokensPerSecond'],0)

    def test_training_overfits_then_reports_unseen(self):
        rows=[{'question':q,'answer':a} for q,a in [('heart pumps?','heart'),('what pumps blood?','heart'),('pumping organ?','heart'),('lungs breathe?','lungs'),('what helps breathing?','lungs'),('breathing organ?','lungs'),('brain thinks?','brain'),('organ of thought?','brain'),('what controls thinking?','brain')]]
        unseen_rows=[{'question':q,'answer':a} for q,a in [('Which organ circulates blood?','heart'),('Which organ is for respiration?','lungs'),('Which organ is responsible for thinking?','brain')]]
        request={'config':m.asdict(self.c),'epochs':120,'batch_size':4,'learning_rate':.005,'seed':12,'device':'cpu','rows':rows,'name':'test','mode':'qa'}
        with tempfile.TemporaryDirectory() as tmp:
            m.train(request,Path(tmp));model,saved=m.load_checkpoint(Path(tmp)/'checkpoint.pt',torch.device('cpu'))
            train=saved['splits']['train'];report=m.evaluate(model,saved,train,torch.device('cpu'))
            self.assertGreaterEqual(report['exactMatch'],.75, report)
            unseen=m.evaluate(model,saved,unseen_rows,torch.device('cpu'))
            self.assertEqual(unseen['questionOverlaps'],0)
            self.assertTrue((Path(tmp)/'status.json').is_file())
            print('OVERFIT / UNSEEN:',json.dumps({'train':report['exactMatch'],'unseen':unseen},ensure_ascii=False))

    @unittest.skipUnless(torch.backends.mps.is_available(), 'MPS unavailable')
    def test_mps(self):
        model=m.Transformer(self.c).to(m.device_for('mps'));logits,_=model(torch.tensor([[1,2]],device='mps'));self.assertEqual(logits.shape,(1,2,260))

if __name__=='__main__': unittest.main()
