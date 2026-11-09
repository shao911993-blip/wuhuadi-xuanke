// Run with: node tests/architecture.test.cjs
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {boot,script}=require('./page-fixture.cjs');
const storageKey='xuanke-selections';
function ids(app){return JSON.parse(app.run('JSON.stringify(SCHOOL_IDS)'));}
function instrument(app){
  app.run(`let paints={find:0,saved:0,compare:0,school:0};
    const originalPainters={find:renderFind,saved:renderSaved,compare:renderCompare,school:renderSchool};
    renderFind=(...args)=>{paints.find++;return originalPainters.find(...args);};
    renderSaved=(...args)=>{paints.saved++;return originalPainters.saved(...args);};
    renderCompare=(...args)=>{paints.compare++;return originalPainters.compare(...args);};
    renderSchool=(...args)=>{paints.school++;return originalPainters.school(...args);};`);
  return ()=>JSON.parse(app.run('JSON.stringify(paints)'));
}

// Explicit identities and fixed legacy mapping survive data reorder and school rename.
const original=boot();
const fixedIds=ids(original);
const legacyFingerprint=crypto.createHash('sha256').update(original.run('JSON.stringify(LEGACY_SCHOOL_IDS)')).digest('hex');
assert.equal(legacyFingerprint,'624af70bc91735293a6760c3b617586c8cd2475defc91447f8e01b73e64adff1','Never rebuild or reorder the published legacy index mapping');
assert.equal(new Set(fixedIds).size,1041);
assert.ok(fixedIds.every(id=>/^bj-[0-9a-f]{16}$/.test(id)));
const schoolName=original.run('S[0][0]');
original.view('#s-0');original.click('save',0);original.click('compare',0);
const dataStart=script.indexOf('const D = ')+10,dataEnd=script.indexOf(';',dataStart);
const data=JSON.parse(script.slice(dataStart,dataEnd));
const order=data.schools.map((_,k)=>k).reverse();
const newIndex=new Map(order.map((old,k)=>[old,k]));
data.schools=order.map(k=>data.schools[k]);
data.schoolIds=order.map(k=>data.schoolIds[k]);
data.loc.loc=order.map(k=>data.loc.loc[k]);
data.rows=data.rows.map(r=>[newIndex.get(r[0]),...r.slice(1)]);
data.hist=Object.fromEntries(Object.entries(data.hist).map(([k,v])=>[newIndex.get(+k),v]));
data.det.detail=Object.fromEntries(Object.entries(data.det.detail).map(([k,v])=>[newIndex.get(+k),v]));
data.schools[newIndex.get(0)]=[schoolName+'（更新名稱）',schoolName+'（更新名稱）',data.schools[newIndex.get(0)][2]];
const reorderedScript=script.slice(0,dataStart)+JSON.stringify(data)+script.slice(dataEnd);
const reordered=boot(original.storage,false,reorderedScript,'#school-'+fixedIds[0]);
assert.equal(reordered.run('st.schoolId'),fixedIds[0]);
assert.equal(reordered.run('schoolIndex(st.schoolId)'),1040);
assert.match(reordered.elements.get('#view-school').textContent,/更新名稱/);
assert.equal(reordered.run('st.saved.has(st.schoolId)&&st.compared.has(st.schoolId)'),true);
assert.equal(reordered.run('OKN[schoolIndex(st.schoolId)]'),original.run('OKN[0]'));
reordered.view('#s-0');
assert.equal(reordered.run('st.schoolId'),fixedIds[0],'Legacy index URLs use the frozen baseline, not current ordering');
reordered.view('#saved');
assert.equal(reordered.elements.get('#view-saved').querySelector('.item-link').getAttribute('href'),'#school-'+fixedIds[0]);
reordered.view('#school-does-not-exist');assert.equal(reordered.run('st.view'),'find');
reordered.view('#s-999999');assert.equal(reordered.run('st.view'),'find');

// Migrate old indexed favorites using that same baseline, even on a reordered dataset.
const legacyStorage=new Map([['saved-schools','[0,1,0,-1,"2",999999]'],['compared-schools','[0,1,2,3,4]']]);
const legacy=boot(legacyStorage,false,reorderedScript);
assert.deepEqual(JSON.parse(legacy.run('JSON.stringify([...st.saved])')),fixedIds.slice(0,2));
assert.deepEqual(JSON.parse(legacy.run('JSON.stringify([...st.compared])')),fixedIds.slice(0,4));
const migrated=JSON.parse(legacyStorage.get(storageKey));
assert.equal(migrated.version,1);
assert.deepEqual(migrated.saved,fixedIds.slice(0,2));
assert.equal(legacyStorage.get('saved-schools'),'[0,1,0,-1,"2",999999]','Keep legacy values as recovery data');
const secondLoad=boot(legacyStorage);
assert.deepEqual(JSON.parse(secondLoad.run('JSON.stringify([...st.saved])')),migrated.saved);
const modernPriority=new Map(legacyStorage);
modernPriority.set(storageKey,JSON.stringify({version:1,saved:[fixedIds[3],fixedIds[3],'unknown',0],compared:fixedIds.slice(0,6)}));
const modern=boot(modernPriority);
assert.deepEqual(JSON.parse(modern.run('JSON.stringify([...st.saved])')),[fixedIds[3]]);
assert.equal(modern.run('st.compared.size'),4);
const futureData=boot(new Map([[storageKey,'{"version":99,"saved":[0]}'],['saved-schools','[0]']]));
assert.equal(futureData.run('st.saved.size'),0,'An unknown storage version must not be interpreted as indexed IDs');
const malformed=boot(new Map([[storageKey,'{bad json']]));
assert.equal(malformed.run('st.saved.size'),0);
const lockedStorage=new Map([['saved-schools','[0]']]);
lockedStorage.set=()=>{throw Error('Write denied');};
const locked=boot(lockedStorage);
assert.equal(locked.run('st.saved.has(schoolId(0))'),true,'Failed migration still restores the old selection in this session');
locked.view('#s-0');locked.click('compare',0);
assert.match(locked.elements.get('#action-status').textContent,/无法保存/);
assert.equal(lockedStorage.get('saved-schools'),'[0]');

// Reducer and renderers do not mutate the previous state; all filters normalize together.
const state=boot();
assert.equal(state.run(`(()=>{const before=st;const next=reduceState(before,{type:'filter',key:'t',value:'985'});return before.t===''&&next.t==='985'&&next!==before;})()`),true);
assert.equal(state.run(`(()=>{const before=st;const next=reduceState(before,{type:'toggle-choice',key:'saved',id:schoolId(0)});return !before.saved.has(schoolId(0))&&next.saved.has(schoolId(0))&&next.saved!==before.saved;})()`),true);
assert.equal(state.run(`(()=>{const before=JSON.stringify(st);locationOptions(st);fillLoc();renderFind();return before===JSON.stringify(st);})()`),true);
state.input('myrank','1.5');assert.equal(state.run('st.my'),null);
state.input('myrank','-1');assert.equal(state.run('st.my'),null);
state.input('myrank','15000');assert.equal(state.run('st.my'),15000);
state.run(`dispatch({type:'filter',key:'prov',value:'does-not-exist'})`);
assert.equal(state.run('st.prov'), '');assert.equal(state.run('st.city'),'');
state.run(`dispatch({type:'theme',value:'invalid'})`);assert.equal(state.run('st.theme'),'system');

// Choice changes patch existing buttons and leave unrelated and hidden pages untouched.
const incremental=boot();
const paints=instrument(incremental);
const results=incremental.elements.get('#results');
const listItem=results.querySelector('.item-link');
const firstId=results.querySelector('[data-save]').dataset.save;
const originalButton=results.querySelector(`[data-save="${firstId}"]`);
incremental.click('save',firstId);
assert.deepEqual(paints(),{find:0,saved:0,compare:0,school:0});
assert.equal(results.querySelector('.item-link'),listItem);
assert.equal(results.querySelector(`[data-save="${firstId}"]`),originalButton);
assert.equal(originalButton.getAttribute('aria-pressed'),'true');
assert.equal(incremental.document.activeElement,originalButton);
assert.equal(incremental.elements.get('#view-saved').innerHTML,'','Do not build a hidden saved page');
incremental.view('#saved');
assert.equal(paints().saved,1);
incremental.click('compare',firstId);
assert.equal(paints().saved,1,'Compare selection does not replace the saved list');
incremental.view('#compare');
assert.equal(paints().compare,1);
const compareRoot=incremental.elements.get('#view-compare');
const compareTable=compareRoot.querySelector('.compare-table');
const comparisonFold=compareRoot.querySelector('details');
comparisonFold.open=true;comparisonFold.dispatch('toggle');
incremental.click('save',firstId);
assert.equal(paints().compare,1,'Favorite changes do not rebuild the comparison');
assert.equal(compareRoot.querySelector('.compare-table'),compareTable);
assert.equal(compareRoot.querySelector('details'),comparisonFold);
assert.equal(comparisonFold.open,true);
incremental.view('#s-1');incremental.click('compare',1);incremental.view('#compare');
assert.equal(compareRoot.querySelector(`[data-school-id="${firstId}"]`).open,true,'Keep expanded details after adding a comparison column');
incremental.click('compare',1);
assert.equal(compareRoot.querySelector(`[data-school-id="${firstId}"]`).open,true,'Keep expanded details after removing another column');
incremental.elements.get('#script').click();
assert.equal(compareRoot.querySelector(`[data-school-id="${firstId}"]`).open,true,'Keep details through language changes');

// School folds, original-table year and batch survive navigation and language changes.
const school=boot();
school.view('#s-0');
const fold=school.elements.get('#origfold');fold.open=true;fold.dispatch('toggle');
const detail=fold.querySelector('.det');
detail.querySelector('[data-y="2024"]').click();
const batch=detail.querySelector('[data-b="1"]');if(batch)batch.click();
const year=school.run('st.detailYear[schoolId(0)]'),chosenBatch=school.run('st.detailBatch[schoolId(0)]');
const originalTable=detail.querySelector('table');
school.click('save',0);school.click('compare',0);
assert.equal(school.elements.get('#origfold'),fold);
assert.equal(school.elements.get('#origfold').querySelector('table'),originalTable);
school.view('#find');school.view('#s-0');
assert.equal(school.elements.get('#origfold').open,true);
assert.equal(school.run('st.detailYear[schoolId(0)]'),year);
assert.equal(school.run('st.detailBatch[schoolId(0)]'),chosenBatch);
school.elements.get('#script').click();
assert.equal(school.elements.get('#origfold').open,true);
assert.equal(school.elements.get('#origfold').querySelector(`[data-y="${year}"]`).getAttribute('aria-pressed'),'true');

// Real queued timers: coalesce search and avoid a second repaint after another action.
const debounce=boot();
const timerPaints=instrument(debounce);
debounce.input('qs','北','input',false);
debounce.input('qs','北京','input',false);
assert.equal(debounce.timers.size,1);
assert.equal(timerPaints().find,0);
debounce.flush();assert.equal(timerPaints().find,1);
debounce.input('qs','上海','input',false);
debounce.segment('seg-t','985');
assert.equal(debounce.timers.size,0);
assert.equal(timerPaints().find,2);
assert.ok(debounce.elements.get('#results').textContent.includes('上海'));
debounce.flush();assert.equal(timerPaints().find,2);
debounce.input('qs','清华','input',false);
debounce.run(`dispatch({type:'theme',value:'dark'})`);
assert.equal(debounce.timers.size,0);
assert.equal(timerPaints().find,3,'Theme changes flush the latest query rather than discarding its repaint');
assert.ok(debounce.elements.get('#results').textContent.includes('清华'));

console.log('Passed: stable IDs after reorder/rename, old URLs, versioned storage/migration/failure cases, pure state normalization, lazy page rendering, DOM/focus/fold preservation, and queued-search timing. DOM logic only; no browser layout verification.');
