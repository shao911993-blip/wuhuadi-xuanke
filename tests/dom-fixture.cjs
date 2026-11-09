// Minimal DOM fixture for this page's logic tests. Does not emulate layout or painting.
const voidTags = new Set(['input','meta','link','br','hr','img']);
class Element {
  constructor(tag, attrs = {}, ownerDocument) {
    this.tag = tag; this.attrs = attrs; this.ownerDocument = ownerDocument;
    this.parentElement = null; this.children = []; this.style = {}; this.events = {};
    this.classList = {toggle: (name, force) => {
      const names = new Set((this.attrs.class || '').split(/\s+/).filter(Boolean));
      if (force ?? !names.has(name)) names.add(name); else names.delete(name);
      this.attrs.class = [...names].join(' ');
    }};
  }
  get dataset() { return Object.fromEntries(Object.entries(this.attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v])); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(v) { if(v) this.setAttribute('hidden',''); else this.removeAttribute('hidden'); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(v) { if(v) this.setAttribute('disabled',''); else this.removeAttribute('disabled'); }
  get open() { return this.hasAttribute('open'); }
  set open(v) { if(v) this.setAttribute('open',''); else this.removeAttribute('open'); }
  get value() { return this._value ?? (this.tag==='select' ? this.querySelector('option')?.getAttribute('value') || '' : ''); }
  set value(v) { this._value=this.tag==='select' && !this.querySelectorAll('option').some(o=>o.getAttribute('value')===String(v)) ? '' : String(v); }
  get innerHTML() { return this.children.map(c=>typeof c==='string'?c:c.outerHTML).join(''); }
  set innerHTML(html) {
    this.children=[]; this._value=undefined;
    const stack=[this];
    for(const token of String(html).matchAll(/<!--[\s\S]*?-->|<\/?([a-z][\w-]*)([^>]*?)>|([^<]+)/gi)) {
      const raw=token[0], tag=token[1]?.toLowerCase();
      if(raw.startsWith('<!--')) continue;
      if(!tag) { stack.at(-1).children.push(raw); continue; }
      if(raw.startsWith('</')) { if(stack.length>1) stack.pop(); continue; }
      const attrs={};
      for(const [,key,quoted,single,bare] of token[2].matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[key]=quoted??single??bare??'';
      const child=new Element(tag,attrs,this.ownerDocument);
      child.parentElement=stack.at(-1); child.parentElement.children.push(child);
      if(!voidTags.has(tag) && !raw.endsWith('/>')) stack.push(child);
    }
  }
  get outerHTML() { return `<${this.tag}${Object.entries(this.attrs).map(([k,v])=>` ${k}="${v}"`).join('')}>${voidTags.has(this.tag)?'':this.innerHTML+`</${this.tag}>`}`; }
  get textContent() { return this.children.map(c=>typeof c==='string'?c:c.textContent).join(''); }
  set textContent(v) { this.children=[String(v)]; }
  getAttribute(k) { return this.attrs[k]??null; }
  hasAttribute(k) { return k in this.attrs; }
  setAttribute(k,v) { this.attrs[k]=String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  matches(selector) {
    return selector.split(',').some(part=>{
      const chain=part.trim().split(/\s+/); let node=this;
      const simple=(el,s)=> {
        const tag=s.match(/^[\w-]+/)?.[0];
        if(tag && tag!==el.tag) return false;
        for(const [,prefix,name] of s.matchAll(/([.#])([\w-]+)/g)) {
          if(prefix==='#' ? el.attrs.id!==name : !(el.attrs.class||'').split(/\s+/).includes(name)) return false;
        }
        for(const [,key,value] of s.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) if(!el.hasAttribute(key) || (value!==undefined && el.getAttribute(key)!==value)) return false;
        return true;
      };
      if(!simple(node,chain.pop())) return false;
      while(chain.length) { const s=chain.pop(); node=node.parentElement; while(node&&!simple(node,s)) node=node.parentElement; if(!node) return false; }
      return true;
    });
  }
  querySelectorAll(selector) {
    const found=[];
    const visit=node=>node.children.forEach(c=>{if(typeof c!=='string'){if(c.matches(selector)) found.push(c);visit(c);}});
    visit(this); return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0]??null; }
  closest(selector) { let n=this; while(n&&!n.matches(selector)) n=n.parentElement; return n; }
  addEventListener(name,fn) { (this.events[name]??=[]).push(fn); }
  dispatch(name, event={target:this}) { this['on'+name]?.(event); for(const fn of this.events[name]||[]) fn(event); }
  focus() { this.ownerDocument.activeElement=this; }
  click() {
    if(this.disabled) return;
    this.focus(); const event={target:this}; let n=this;
    while(n) { n.dispatch('click',event); n=n.parentElement; }
  }
}
function createDocument(html) {
  const doc=new Element('document'); doc.ownerDocument=doc;
  doc.innerHTML=html.replace(/<style[\s\S]*?<\/style>/g,'');
  doc.body=doc.querySelector('body'); doc.documentElement=doc.querySelector('html'); doc.activeElement=null;
  doc.createTreeWalker=()=>({nextNode:()=>null});
  return doc;
}
module.exports={createDocument};
