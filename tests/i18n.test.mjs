import test from 'node:test';
import assert from 'node:assert/strict';
import {languages,messages,normalizeLanguage,t} from '../ui/i18n.js';

test('all five languages cover the interface and default to English',()=>{
 const keys=Object.keys(messages.en).sort();
 assert.deepEqual(Object.keys(languages),['en','it','de','fr','es']);
 for(const language of Object.keys(languages))assert.deepEqual(Object.keys(messages[language]).sort(),keys,`${language} has a missing translation`);
 assert.equal(normalizeLanguage(undefined),'en');
 assert.equal(t(undefined,'newChat'),'＋ New chat');
 assert.equal(t('de','language'),'Sprache');
 assert.equal(t('fr','remove',{name:'test.pdf'}),'Supprimer test.pdf');
});
