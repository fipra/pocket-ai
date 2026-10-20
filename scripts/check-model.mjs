import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../models');
if(!(await fs.readdir(dir)).some(f=>f.endsWith('.gguf'))){console.error('Build annullata: manca il modello incluso. Esegui npm run model:download oppure copia un GGUF e la relativa licenza in models/.');process.exit(1);}
