const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createDocument}=require('./dom-fixture.cjs');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);

function boot(storage=new Map(),unavailable=false,source=script,initialHash=''){
  const document=createDocument(html.split('<script>')[0]);
  const elements={get:selector=>document.querySelector(selector)};
  const localStorage={
    getItem(k){if(unavailable)throw Error('Storage unavailable');return storage.get(k)??null;},
    setItem(k,v){if(unavailable)throw Error('Storage unavailable');storage.set(k,String(v));},
  };
  let serial=0;
  const timers=new Map();
  const context=vm.createContext({document,localStorage,location:{hash:initialHash},
    window:{addEventListener(){},scrollTo(){}},NodeFilter:{SHOW_TEXT:4,FILTER_REJECT:2,FILTER_ACCEPT:1},
    setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);}});
  const run=code=>vm.runInContext(code,context);
  run(source);
  const id=k=>typeof k==='number'?run(`schoolId(${k})`):k;
  function flush(){
    let count=0;
    while(timers.size){if(++count>100)throw Error('Timers did not settle');const [key,fn]=timers.entries().next().value;timers.delete(key);fn();}
  }
  return {storage,elements,document,run,id,flush,timers,
    input(name,value,event='input',settle=true){const el=elements.get('#'+name);el.value=value;el.focus();el.dispatch(event);if(settle)flush();},
    click(kind,k){
      const view=run('st.view'),button=document.querySelector(`#view-${view} [data-${kind}="${id(k)}"]`);
      assert.ok(button,`Missing ${kind} button for ${k} in ${view}`);button.click();return button;
    },
    segment(name,value){const button=document.querySelectorAll(`#${name} button`).find(b=>Object.values(b.dataset).includes(value));assert.ok(button);button.click();},
    view(hash){context.location.hash=hash;run('route()');},
  };
}
module.exports={boot,script};
