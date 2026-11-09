// Run with: node tests/features.test.cjs
// Exercise the standalone page with its real embedded data, without browser dependencies.
const assert = require('node:assert/strict');
const {boot}=require('./page-fixture.cjs');

const app = boot();
assert.ok(app.elements.get('#results').innerHTML.includes('data-save='));
assert.match(app.elements.get('#sort-hint').textContent,/填写我的位次/);
app.input('myrank','15000');
const ordered = JSON.parse(app.run('JSON.stringify(sortSchools(S.map((_,i)=>i)).map(k=>({k,rank:LATEST[k]?.max??null})))'));
const distances = ordered.map(x => x.rank===null ? Infinity : Math.abs(x.rank-15000));
assert.ok(distances.every((d,i) => i===0 || d>=distances[i-1]), 'Nearest rank first; records without ranks last');
assert.equal(app.storage.get('myrank'),'15000');
app.input('sort','threshold','change');
const ranks = JSON.parse(app.run('JSON.stringify(sortSchools(S.map((_,i)=>i)).map(k=>LATEST[k]?.max??null))')).map(n=>n??Infinity);
assert.ok(ranks.every((n,i)=>i===0||n>=ranks[i-1]), 'Threshold sorting still available');
app.input('sort','near','change');
app.input('myrank','');
assert.equal(app.run('st.my'),null);
assert.match(app.elements.get('#sort-hint').textContent,/填写我的位次/);

app.click('save',0);
app.view('#saved');
assert.equal(app.elements.get('#view-saved').querySelector(`[data-save="${app.id(0)}"]`).getAttribute('aria-pressed'),'true');
assert.equal(app.elements.get('#view-saved').style.display,'flex');
app.input('qs','__no_school__');
assert.ok(app.elements.get('#view-saved').querySelector(`[data-save="${app.id(0)}"]`),'Search must not hide saved schools');
app.view('#find');
assert.match(app.elements.get('#results').innerHTML,/没有符合/);
app.input('qs','');
app.view('#s-0');
assert.equal(app.elements.get('#view-school').querySelector(`[data-save="${app.id(0)}"]`).getAttribute('aria-pressed'),'true');
app.click('save',0);
app.view('#saved');
assert.match(app.elements.get('#view-saved').innerHTML,/还没有收藏/);
app.view('#s-1');
app.click('save',1);

for (let k=0;k<5;k++) { app.view('#s-'+k); app.click('compare',k); }
assert.equal(app.run('st.compared.size'),4,'Comparison capped at four');
assert.equal(app.elements.get('#view-school').querySelector(`[data-compare="${app.id(4)}"]`).disabled,true);
assert.equal(app.elements.get('#compare-tray').hidden,false);
app.view('#compare');
let comparison=app.elements.get('#view-compare').innerHTML;
assert.equal((comparison.match(/<th scope="col">/g)||[]).length,5);
assert.match(comparison,/2026 年门槛/);
assert.match(comparison,/2027 可报专业明细/);
assert.match(comparison,/sources\/bj-2027-xuanke.pdf#page=/);
assert.doesNotMatch(comparison,/Infinity|NaN|undefined/);
assert.equal(app.elements.get('#compare-tray').hidden,true);
app.input('myrank','15000');
assert.match(app.elements.get('#view-compare').innerHTML,/与我的位次比较/);
app.click('compare',1);
app.view('#s-4');
app.click('compare',4);
assert.equal(app.run('st.compared.has(schoolId(4))'),true,'Removing a school frees a comparison slot');
app.view('#compare');
app.elements.get('#script').click();
assert.match(app.elements.get('#view-compare').innerHTML,/學校比較/);
assert.match(app.elements.get('#tab-saved').textContent,/我的收藏/);

const restored = boot(app.storage);
assert.equal(restored.run('st.saved.has(schoolId(1))'),true,'Favorites survive reopening');
assert.equal(restored.run('st.compared.size'),4,'Comparison survives reopening');
assert.equal(restored.run('st.my'),15000);
assert.equal(restored.run('st.tc'),true,'Language choice survives reopening');
restored.view('#compare');
for (const k of [0,2,3,4]) restored.click('compare',k);
restored.view('#compare');
assert.match(restored.elements.get('#view-compare').innerHTML,/還沒有待比較/);
assert.equal(restored.elements.get('#compare-tray').hidden,true);

const corrupt=boot(new Map([['saved-schools','{broken'],['compared-schools','[0,0,-1,"2",99999,1,2,3,4]']]));
assert.equal(corrupt.run('st.saved.size'),0);
assert.equal(corrupt.run('st.compared.size'),4);
const blocked=boot(new Map(),true);
blocked.view('#s-0');
blocked.click('save',0);
blocked.click('compare',0);
assert.equal(blocked.run('st.saved.has(schoolId(0)) && st.compared.has(schoolId(0))'),true,'Storage failures preserve in-session use');
assert.match(blocked.elements.get('#action-status').textContent,/浏览器无法保存/);

// Province/city choices must stay consistent with the selected school tier.
const filters=boot();
const hebei=filters.run('PV.findIndex(p=>p[0]==="河北")');
assert.ok(hebei>=0);
filters.input('prov',String(hebei),'change');
const hebeiCity=filters.elements.get('#city').querySelectorAll('option').find(o=>o.getAttribute('value')!=='');
assert.ok(hebeiCity);
filters.input('city',hebeiCity.getAttribute('value'),'change');
assert.notEqual(filters.run('st.city'),'');
const no985Province=filters.run('PV.findIndex((_,p)=>new Set(S.map((s,k)=>k).filter(k=>SL[k][0]===p&&SL[k][1]>=0).map(k=>SL[k][1])).size>=2&&!S.some((s,k)=>SL[k][0]===p&&s[2]==="985"))');
assert.ok(no985Province>=0);
filters.input('prov',String(no985Province),'change');
const removedProvinceCity=filters.elements.get('#city').querySelectorAll('option').find(o=>o.getAttribute('value')!=='').getAttribute('value');
filters.input('city',removedProvinceCity,'change');
filters.run('let findCalls=0; const originalFind=renderFind; renderFind=()=>{findCalls++;originalFind();}');
filters.segment('seg-t','985');
assert.equal(filters.run('findCalls'),1,'Tier click renders the list once');
assert.equal(filters.run('st.prov'),'','An unavailable province is cleared');
assert.equal(filters.run('st.city'),'','The dependent city is cleared');
assert.equal(filters.elements.get('#prov').value,'');
assert.equal(filters.elements.get('#city').hidden,true);
assert.notEqual(filters.elements.get('#count').textContent,'0 所学校');

filters.segment('seg-t','');
// Hebei contains a 985 branch in this dataset, so retain its valid province option.
filters.input('prov',String(hebei),'change');
filters.input('city',hebeiCity.getAttribute('value'),'change');
filters.segment('seg-t','985');
assert.equal(filters.run('st.prov'),String(hebei));
assert.equal(filters.elements.get('#prov').value,String(hebei));
assert.notEqual(filters.elements.get('#count').textContent,'0 所学校');
filters.segment('seg-t','');
// Also cover a province that retains multiple cities but loses the selected city.
const cityCase=JSON.parse(filters.run(`JSON.stringify((()=>{
  for(let p=0;p<PV.length;p++) {
    const all=S.map((_,k)=>k).filter(k=>SL[k][0]===p);
    const keptCities=[...new Set(all.filter(k=>S[k][2]==="985"&&SL[k][1]>=0).map(k=>SL[k][1]))];
    const removedCity=all.find(k=>SL[k][1]>=0&&!keptCities.includes(SL[k][1]));
    if(keptCities.length>=2&&removedCity!==undefined) return {p,c:SL[removedCity][1]};
  }
})())`));
assert.ok(cityCase);
filters.input('prov',String(cityCase.p),'change');
filters.input('city',String(cityCase.c),'change');
assert.equal(filters.run('st.city'),String(cityCase.c));
filters.segment('seg-t','985');
assert.equal(filters.run('st.prov'),String(cityCase.p));
assert.equal(filters.run('st.city'),'','A removed city is cleared even when the province remains valid');
assert.equal(filters.elements.get('#city').value,'');
assert.equal(filters.elements.get('#city').hidden,false);
const expectedTierCount=filters.run('S.filter((s,k)=>s[2]==="985"&&SL[k][0]===+st.prov).length');
assert.equal(filters.elements.get('#count').textContent,`${expectedTierCount} 所学校`);
const validCity=filters.elements.get('#city').querySelectorAll('option').find(o=>o.getAttribute('value')!=='').getAttribute('value');
filters.input('city',validCity,'change');
const expectedCityCount=filters.run('S.filter((s,k)=>s[2]==="985"&&SL[k][0]===+st.prov&&SL[k][1]===+st.city).length');
assert.equal(filters.elements.get('#count').textContent,`${expectedCityCount} 所学校`);
filters.input('prov','','change');
assert.equal(filters.run('st.city'),'');

// Missing rank gets a visible explanation; entering/clearing it updates the filter.
filters.segment('seg-reach','1');
assert.equal(filters.elements.get('#reach-hint').hidden,false);
assert.match(filters.elements.get('#reach-hint').textContent,/请先填写/);
filters.input('myrank','15000');
assert.equal(filters.elements.get('#reach-hint').hidden,true);
assert.equal(filters.elements.get('#count').textContent,`${filters.run('S.filter((s,k)=>s[2]==="985"&&LATEST[k]&&LATEST[k].max>=15000).length')} 所学校`);
filters.input('myrank','');
assert.equal(filters.elements.get('#reach-hint').hidden,false);
filters.segment('seg-reach','');
assert.equal(filters.elements.get('#reach-hint').hidden,true);

// Render actual original tables, switch years/batches, and preserve their DOM on actions.
const details=boot();
const originalCase=JSON.parse(details.run(`JSON.stringify((()=>{
  for(const k in DET.detail) for(const y of Object.keys(DET.detail[k]).map(Number).sort((a,b)=>a-b)) {
    const blocks=DET.detail[k][y], batches=[...new Set(blocks.map(b=>b.b))].sort();
    if(batches.length>1&&blocks.some(b=>b.l.length)) return {k:+k,y,b:batches[1]};
  }
})())`));
assert.ok(originalCase);
details.view('#s-'+originalCase.k);
const schoolRoot=details.elements.get('#view-school');
const majorFold=schoolRoot.querySelector('details'); majorFold.open=true;
const originalFold=details.elements.get('#origfold'); originalFold.open=true; originalFold.dispatch('toggle');
const originalTable=originalFold.querySelector('.det');
assert.ok(originalTable.querySelector('table.orig'),'Opening the fold renders the original table');
originalTable.querySelector(`[data-y="${originalCase.y}"]`).click();
originalTable.querySelector(`[data-b="${originalCase.b}"]`).click();
assert.equal(details.run(`st.detailYear[schoolId(${originalCase.k})]`),originalCase.y);
assert.equal(details.run(`st.detailBatch[schoolId(${originalCase.k})]`),originalCase.b);
const tableMarkup=originalTable.innerHTML;
const schoolMarkupBefore=schoolRoot.innerHTML;
details.click('save',originalCase.k);
details.click('compare',originalCase.k);
assert.equal(details.elements.get('#origfold'),originalFold,'Do not replace the original fold');
assert.equal(originalFold.open,true);
assert.equal(majorFold.open,true,'Other expanded sections also stay open');
assert.equal(originalFold.querySelector('.det'),originalTable);
assert.equal(originalTable.innerHTML,tableMarkup,'Year, batch, and original table stay intact');
assert.equal(originalTable.querySelector(`[data-y="${originalCase.y}"]`).getAttribute('aria-pressed'),'true');
assert.equal(originalTable.querySelector(`[data-b="${originalCase.b}"]`).getAttribute('aria-pressed'),'true');
assert.notEqual(schoolRoot.innerHTML,schoolMarkupBefore,'Only the action button states change');
assert.equal(schoolRoot.querySelector('[data-save]').getAttribute('aria-pressed'),'true');
const year2026=originalTable.querySelector('[data-y="2026"]');
assert.ok(year2026); year2026.click();
assert.match(originalTable.textContent,/投档线/);
assert.ok(originalTable.querySelector('table.orig'));
assert.doesNotMatch(originalTable.innerHTML,/NaN|undefined|Infinity/);

// Verify the rendered Traditional Chinese list, not just a page heading.
const traditional=boot();
traditional.elements.get('#script').click();
assert.equal(traditional.document.documentElement.lang,'zh-Hant');
const traditionalList=traditional.elements.get('#results').innerHTML;
assert.match(traditionalList,/物化地可報/);
assert.match(traditionalList,/個專業/);
assert.doesNotMatch(traditionalList,/可报|个专业|学校|加入比较/);
const firstKey=traditional.run(`schoolIndex(${JSON.stringify(traditional.elements.get('#results').querySelector('[data-save]').dataset.save)})`);
assert.ok(traditionalList.includes(traditional.run(`esc(S[${firstKey}][1])`)));
traditional.input('qs',traditional.run(`S[${firstKey}][1]`));
assert.ok(traditional.elements.get('#results').querySelector(`[data-save="${traditional.id(firstKey)}"]`),'Search accepts Traditional Chinese school names');
traditional.segment('seg-reach','1');
assert.match(traditional.elements.get('#reach-hint').textContent,/請先填寫/);
traditional.elements.get('#script').click();
assert.equal(traditional.document.documentElement.lang,'zh-Hans');
assert.match(traditional.elements.get('#results').innerHTML,/物化地可报/);
console.log('Passed: existing features plus province/city and tier transitions, single render per tier click, missing-rank guidance, original-table year/batch navigation and state preservation, and Traditional Chinese list/search. DOM logic only; no browser layout verification.');
