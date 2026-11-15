/** Purpose Driven storage API. Deploy only as a new standalone project. */
const ROOT = 'Purpose Driven';
const SHEET = 'Records';
const HEADERS = ['id','owner_id','type','date','data','created_at','updated_at'];
// Intentional safety brake: this prototype must never place other users' records in a developer Drive.
const MULTI_USER_DRIVE_STORAGE_CONFIGURED = false;

function doPost(e) {
  try {
    if (!MULTI_USER_DRIVE_STORAGE_CONFIGURED) return output_({ ok:false, error:'Purpose Driven storage is not configured for per-user Google Drive authorization.' });
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const claims = verifyProof_(req.proof);
    if (!claims) return output_({ ok:false, error:'Unauthorized gateway request' });
    const allowed = ['dashboard','capture','processCapture','clearProcessedCaptures','task','updateTask','completeTask','deleteTask','person','completePerson','goal','review','food','weight','exercise'];
    if (allowed.indexOf(req.action) === -1 || !req.payload || typeof req.payload !== 'object') return output_({ ok:false, error:'Invalid request' });
    return output_({ ok:true, data:route_(claims, req.action, req.payload) });
  } catch (err) { console.error(err); return output_({ ok:false, error:'Unable to process request' }); }
}

function route_(claims, action, p) {
  const owner = claims.sub;
  if (action === 'dashboard') return dashboard_(owner);
  if (action === 'task') append_(owner, 'task', taskPayload_(p));
  else if (action === 'updateTask') update_(owner, p.id, 'task', taskPayload_(p, true));
  else if (action === 'completeTask') update_(owner, p.id, 'task', { done:!!p.done, completedAt:p.done ? now_() : '' });
  else if (action === 'deleteTask') update_(owner, p.id, 'task', { deleted:true, deletedAt:now_() });
  else if (action === 'person') append_(owner, 'person', personPayload_(p));
  else if (action === 'completePerson') update_(owner, p.id, 'person', { completed:true, completedAt:now_() });
  else if (action === 'goal') append_(owner, 'goal', { title:text_(p.title,240), status:'Active', createdAt:now_() });
  else if (action === 'review') upsertReview_(owner, reviewPayload_(p));
  else if (action === 'food') append_(owner, 'food', foodPayload_(p));
  else if (action === 'weight') append_(owner, 'weight', weightPayload_(p));
  else if (action === 'exercise') append_(owner, 'exercise', exercisePayload_(p));
  else if (action === 'capture') capture_(claims, p);
  else if (action === 'processCapture') processCapture_(claims, p);
  else if (action === 'clearProcessedCaptures') clearProcessedCaptures_(owner);
  return dashboard_(owner);
}

function taskPayload_(p, partial) {
  const out = {};
  if (!partial || p.title !== undefined) { const title=text_(p.title,240); if (!title) throw Error('Task required'); out.title=title; }
  if (!partial || p.due !== undefined) out.due=date_(p.due);
  if (!partial || p.time !== undefined) out.time=time_(p.time);
  if (!partial || p.priority !== undefined) out.priority=['high','normal','low'].indexOf(p.priority)>-1?p.priority:'normal';
  if (!partial || p.domain !== undefined) out.domain=text_(p.domain,80)||'Personal';
  if (!partial || p.notes !== undefined) out.notes=text_(p.notes,2000);
  if (!partial) { out.done=false; out.deleted=false; out.createdAt=now_(); }
  return out;
}
function personPayload_(p) { const name=text_(p.name,240); if (!name) throw Error('Name required'); return { name:name, note:text_(p.note,1000), due:date_(p.due), time:time_(p.time), completed:false, createdAt:now_() }; }
function reviewPayload_(p) { return { date:date_(p.date)||today_(), morning:text_(p.morning,2000), evening:text_(p.evening,4000), energy:boundedNumber_(p.energy,1,5,3), updatedAt:now_() }; }
function foodPayload_(p) { const text=text_(p.text,500); if (!text) throw Error('Food required'); return { kind:'food', text:text, calories:boundedNumber_(p.calories,0,10000,0), protein:boundedNumber_(p.protein,0,1000,0), carbs:boundedNumber_(p.carbs,0,2000,0), fat:boundedNumber_(p.fat,0,1000,0), label:'Food: '+text }; }
function weightPayload_(p) { const value=boundedNumber_(p.value,0.1,1000,0); if (!value) throw Error('Invalid weight'); const unit=p.unit==='lb'?'lb':'kg'; return { kind:'weight', value:value, unit:unit, label:'Weight: '+value+' '+unit }; }
function exercisePayload_(p) { const text=text_(p.text,500), minutes=boundedNumber_(p.minutes,0,1440,0); if (!text&&!minutes) throw Error('Exercise required'); return { kind:'exercise', text:text, minutes:minutes, label:'Exercise: '+(text||minutes+' min') }; }

function capture_(claims, p) {
  const text=text_(p.text,5000); if (!text) throw Error('Empty capture');
  const destination=['inbox','task','person','journal'].indexOf(p.destination)>-1?p.destination:'inbox';
  const capture={ text:text, categories:arrayText_(p.categories,40,12), journal:!!p.journal, destination:destination, due:date_(p.due), processed:destination!=='inbox', createdAt:now_() };
  append_(claims.sub,'capture',capture);
  if (destination==='task') append_(claims.sub,'task',taskPayload_({title:text,due:capture.due,domain:capture.categories[0]||'Personal'}));
  if (destination==='person') append_(claims.sub,'person',personPayload_({name:text,note:'Captured follow-up',due:capture.due}));
  if (capture.journal || destination==='journal') appendToDoc_(claims,capture);
}
function processCapture_(claims, p) {
  const record=recordById_(claims.sub,p.id,'capture'); if (!record || record.data.processed) throw Error('Capture not found');
  const destination=['task','person','journal'].indexOf(p.destination)>-1?p.destination:'task';
  if (destination==='task') append_(claims.sub,'task',taskPayload_({title:record.data.text,due:record.data.due,domain:(record.data.categories||[])[0]||'Personal'}));
  if (destination==='person') append_(claims.sub,'person',personPayload_({name:record.data.text,note:'Captured follow-up',due:record.data.due}));
  if (destination==='journal') appendToDoc_(claims,record.data);
  update_(claims.sub,p.id,'capture',{processed:true,processedAt:now_(),processedAs:destination});
}
function clearProcessedCaptures_(owner) { records_(owner).filter(r=>r.type==='capture'&&r.data.processed&&!r.data.archived).forEach(r=>update_(owner,r.id,'capture',{archived:true,archivedAt:now_()})); }

function dashboard_(owner) {
  const rows=records_(owner), date=today_();
  const typed = type => rows.filter(r=>r.type===type).map(r=>Object.assign({id:r.id,date:r.date},r.data));
  return {
    tasks:typed('task').filter(x=>!x.deleted), people:typed('person'), captures:typed('capture').filter(x=>!x.archived), goals:typed('goal'), reviews:typed('review'),
    health:rows.filter(r=>['food','weight','exercise'].indexOf(r.type)>-1).map(r=>Object.assign({id:r.id,date:r.date},r.data)).slice(-60), today:date
  };
}

function append_(owner,type,data) { const now=new Date(); sheet_().appendRow([Utilities.getUuid(),owner,type,Utilities.formatDate(now,Session.getScriptTimeZone(),'yyyy-MM-dd'),JSON.stringify(data),now.toISOString(),now.toISOString()]); }
function update_(owner,id,type,patch) { const record=recordById_(owner,id,type); if (!record) throw Error('Record not found'); const data=Object.assign({},record.data,patch); const sheet=sheet_(); sheet.getRange(record.row,5).setValue(JSON.stringify(data)); sheet.getRange(record.row,7).setValue(now_()); }
function upsertReview_(owner,data) { const record=records_(owner).filter(r=>r.type==='review'&&r.data.date===data.date).pop(); if (record) update_(owner,record.id,'review',data); else append_(owner,'review',data); }
function records_(owner) { const values=sheet_().getDataRange().getValues(); return values.slice(1).filter(r=>r[1]===owner).map((r,index)=>({row:index+2,id:r[0],type:r[2],date:r[3],data:JSON.parse(r[4]||'{}')})); }
function recordById_(owner,id,type) { const valid=/^[\w-]{10,}$/.test(String(id||'')); if (!valid) throw Error('Invalid record'); return records_(owner).filter(r=>r.id===id&&r.type===type).pop(); }
function sheet_() { const props=PropertiesService.getScriptProperties(); let id=props.getProperty('SHEET_ID'), ss; if (!id) { ss=SpreadsheetApp.create('Purpose Driven Backend'); const sheet=ss.getActiveSheet(); sheet.setName(SHEET); sheet.appendRow(HEADERS); sheet.setFrozenRows(1); id=ss.getId(); props.setProperty('SHEET_ID',id); } else ss=SpreadsheetApp.openById(id); return ss.getSheetByName(SHEET); }
function appendToDoc_(claims,entry) { const root=root_(); const key=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,claims.sub)).slice(0,18); const folders=root.getFoldersByName(key), folder=folders.hasNext()?folders.next():root.createFolder(key); const docs=folder.getFilesByName('Purpose Driven Journal'); const existing=docs.hasNext(), doc=existing?DocumentApp.openById(docs.next().getId()):DocumentApp.create('Purpose Driven Journal'); if (!existing) DriveApp.getFileById(doc.getId()).moveTo(folder); const body=doc.getBody(); body.appendParagraph(Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm')).setHeading(DocumentApp.ParagraphHeading.HEADING2); if (entry.categories&&entry.categories.length) body.appendParagraph(entry.categories.join(' · ')); body.appendParagraph(entry.text); doc.saveAndClose(); }
function root_() { const root=DriveApp.getRootFolder(), folders=root.getFoldersByName(ROOT); return folders.hasNext()?folders.next():root.createFolder(ROOT); }
function text_(value,max) { return String(value||'').trim().slice(0,max); }
function arrayText_(value,max,count) { return (Array.isArray(value)?value:[]).map(x=>text_(x,max)).filter(Boolean).slice(0,count); }
function boundedNumber_(value,min,max,fallback) { const n=Number(value); return isFinite(n)&&n>=min&&n<=max?n:fallback; }
function date_(value) { const text=String(value||''); return /^\d{4}-\d{2}-\d{2}$/.test(text)?text:''; }
function time_(value) { const text=String(value||''); return /^\d{2}:\d{2}$/.test(text)?text:''; }
function today_() { return Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd'); }
function now_() { return new Date().toISOString(); }
function verifyProof_(proof) { const parts=String(proof||'').split('.'); if(parts.length!==2)return null; const secret=PropertiesService.getScriptProperties().getProperty('APP_GATEWAY_SHARED_SECRET'); if(!secret)return null; const expected=Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0],secret)).replace(/=+$/,''); if(!constantTime_(expected,parts[1]))return null; const claims=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); const now=Math.floor(Date.now()/1000); if(!claims.sub||!claims.nonce||claims.exp<=now||claims.iat>now||claims.exp-now>300)return null; const cache=CacheService.getScriptCache(), key='nonce:'+claims.nonce; if(cache.get(key))return null; cache.put(key,'1',Math.max(1,claims.exp-now)); return claims; }
function constantTime_(a,b) { if(a.length!==b.length)return false; let x=0; for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i); return x===0; }
function output_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
