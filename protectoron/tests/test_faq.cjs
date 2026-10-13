const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.textContent='';this.open=false;this.parent=null;}
  append(...children){for(const child of children)this.insertBefore(child,null);}
  replaceChildren(...children){for(const child of [...this.children])child.remove();this.append(...children);}
  insertBefore(child,reference){
    if(child.parent)child.remove();
    const index=reference?this.children.indexOf(reference):this.children.length;
    assert.ok(index>=0);this.children.splice(index,0,child);child.parent=this;
  }
  querySelector(selector){return this.children.find(item=>item.tag===selector||'.'+item.className===selector);}
  remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}}
}
const list = new Element('div');
const context = vm.createContext({$:()=>list,document:{createElement:tag=>new Element(tag)}});
const source = fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
vm.runInContext(source.slice(source.indexOf('function renderFaq('),source.indexOf('\nfunction drawScene(')),context);
const items = [{id:'purpose',question:'Для чего?',answer:'Ответ'},
  {id:'interval',question:'Как часто нужно принимать препарат?',answer:'Каждые 10 Ваших игровых ходов.'}];
context.renderFaq(items);
const interval = list.children[1];interval.open=true;
const summary = interval.querySelector('summary');
context.document.activeElement=summary;
// Repeat the same refreshes the report status poll triggers every 10 seconds.
for(let i=0;i<20;i++)context.renderFaq(items);
assert.equal(list.children[1],interval,'Polling must retain the disclosure node');
assert.equal(interval.open,true,'An expanded answer must stay expanded');
assert.equal(context.document.activeElement,summary,'Polling must preserve focus');
assert.equal(interval.querySelector('summary'),summary);
context.renderFaq([{...items[0]}, {...items[1],answer:'Обновлённый ответ'}]);
assert.equal(list.children[1],interval);
assert.equal(interval.open,true,'Changed content must also preserve expansion');
assert.equal(interval.querySelector('.faq-answer').textContent,'Обновлённый ответ');
context.renderFaq([...items].reverse());
assert.equal(list.children[0],interval);
assert.equal(interval.open,true);
context.renderFaq([items[1]]);
assert.equal(list.children.length,1,'Obsolete answers must be removed');
assert.equal(list.children[0],interval);
assert.equal(interval.open,true);
console.log('FAQ: expansion, node identity and focus retained across repeated refreshes');
