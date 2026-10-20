import {getLlama,LlamaChatSession} from 'node-llama-cpp';
import {historyForModel,retrieve} from '../src/core.mjs';
import path from 'node:path';
const llama=await getLlama({gpu:false,build:'never'});
const model=await llama.loadModel({modelPath:path.resolve('models/qwen2.5-0.5b-instruct-q4_k_m.gguf')});
const context=await model.createContext({contextSize:4096});
try {
 for(let i=0;i<2;i++){
 const session=new LlamaChatSession({contextSequence:context.getSequence(),systemPrompt:'Rispondi brevemente in italiano.'});
 try{
 session.setChatHistory(historyForModel([],'Rispondi brevemente in italiano.'));
 const response=await session.prompt(i===0?'Saluta Fabrizio in italiano.':'Il codice del progetto è ALFA42. Qual è il codice del progetto?',{maxTokens:50,temperature:0});
 if(!response.trim())throw Error('Risposta vuota');console.log('Inferenza '+(i+1)+': '+response);
 }finally{session.dispose({disposeSequence:true});}
 }
}finally{await context.dispose();await model.dispose();await llama.dispose();}
