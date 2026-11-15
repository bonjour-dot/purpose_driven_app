/** Purpose Driven storage API. A standalone project. */
const ROOT = 'Purpose Driven';
const SHEET = 'Records';
const HEADERS = ['id','owner_id','type','date','data','created_at','updated_at'];
// Fails closed: this prototype must not create shared developer-owned user data.
const MULTI_USER_DRIVE_STORAGE_CONFIGURED = false;

function doPost(e) {
  try {
    if (!MULTI_USER_DRIVE_STORAGE_CONFIGURED) return output_({ ok:false, error:'Purpose Driven storage is not configured for per-user Google Drive authorization.' });
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const claims = verifyProof_(req.proof);
    if (!claims) return output_({ ok:false, error:'Unauthorized gateway request' });
    const allowed = ['today','capture','task','completeTask','person','food','weight','exercise'];
    if (allowed.indexOf(req.action) === -1 || !req.payload || typeof req.payload !== 'object') return output_({ ok:false, error:'Invalid request' });
    const result = route_(claims, req.action, req.payload);
    return output_({ ok:true, ...result });
  } catch (err) { console.error(err); return output_({ ok:false, error:'Unable to process request' }); }
}

function route_(claims, action, p) {
  if (action === 'today') return { data: today_(claims.sub) };
  if (action === 'completeTask') return { data: completeTask_(claims.sub, p) };
  const limits = { capture:5000, task:240, person:240, food:500, weight:30, exercise:500 };
  const clean = cleanPayload_(action, p, limits[action]);
  append_(claims.sub, action, clean);
  if (action === 'capture') appendToDoc_(claims, clean);
  return { data: today_(claims.sub) };
}

function cleanPayload_(action, p, max) {
  const text = x => String(x || '').trim().slice(0, max);
  if (action === 'capture') { const value=text(p.text); if (!value) throw Error('Empty capture'); return { text:value, categories:(Array.isArray(p.categories)?p.categories:[]).map(x=>text(x).slice(0,40)).filter(Boolean).slice(0,12), journal:!!p.journal }; }
  if (action === 'task') { const title=text(p.title); if (!title) throw Error('Task required'); return { title, due:date_(p.due), done:false }; }
  if (action === 'person') { const name=text(p.name); if (!name) throw Error('Name required'); return { name, note:text(p.note), due:date_(p.due) }; }
  if (action === 'food') { const value=text(p.text); if (!value) throw Error('Food required'); return { text:value }; }
  if (action === 'weight') { const value=Number(p.value); if (!isFinite(value)||value<=0||value>1000) throw Error('Invalid weight'); return { value, unit:p.unit==='lb'?'lb':'kg' }; }
  if (action === 'exercise') { const value=text(p.text); const minutes=Math.max(0,Math.min(1440,Number(p.minutes)||0)); if(!value&&!minutes) throw Error('Exercise required'); return { text:value, minutes }; }
  throw Error('Unsupported action');
}

function today_(owner) {
  const rows=records_(owner); const today=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd');
  const tasks=rows.filter(r=>r.type==='task').map(r=>Object.assign({id:r.id},r.data)).sort((a,b)=>(Number(a.done)-Number(b.done))||((a.due||'9999').localeCompare(b.due||'9999'))).slice(0,20);
  const people=rows.filter(r=>r.type==='person').map(r=>Object.assign({id:r.id},r.data)).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).slice(0,8);
  const health=rows.filter(r=>['food','weight','exercise'].indexOf(r.type)>-1&&r.date===today).slice(-6).map(r=>({label:label_(r)}));
  return {tasks,people,health};
}
function completeTask_(owner,p){const id=String(p.id||'');if(!/^[\w-]{10,}$/.test(id))throw Error('Invalid task');const sh=sheet_();const values=sh.getDataRange().getValues();for(let i=1;i<values.length;i++){if(values[i][0]===id&&values[i][1]===owner&&values[i][2]==='task'){const data=JSON.parse(values[i][4]);data.done=!!p.done;sh.getRange(i+1,5).setValue(JSON.stringify(data));sh.getRange(i+1,7).setValue(new Date().toISOString());return today_(owner);}}throw Error('Task not found');}
function append_(owner,type,data){const now=new Date();sheet_().appendRow([Utilities.getUuid(),owner,type,Utilities.formatDate(now,Session.getScriptTimeZone(),'yyyy-MM-dd'),JSON.stringify(data),now.toISOString(),now.toISOString()]);}
function records_(owner){const vals=sheet_().getDataRange().getValues();return vals.slice(1).filter(r=>r[1]===owner).map(r=>({id:r[0],type:r[2],date:r[3],data:JSON.parse(r[4])}));}
function sheet_(){const props=PropertiesService.getScriptProperties();let id=props.getProperty('SHEET_ID');let ss;if(!id){ss=SpreadsheetApp.create('Purpose Driven Backend');const s=ss.getActiveSheet();s.setName(SHEET);s.appendRow(HEADERS);s.setFrozenRows(1);id=ss.getId();props.setProperty('SHEET_ID',id);}else ss=SpreadsheetApp.openById(id);return ss.getSheetByName(SHEET);}
function appendToDoc_(claims,entry){const root=root_();const key=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,claims.sub)).slice(0,18);let folders=root.getFoldersByName(key);const folder=folders.hasNext()?folders.next():root.createFolder(key);let docs=folder.getFilesByName('Purpose Driven Journal');const doc=docs.hasNext()?DocumentApp.openById(docs.next().getId()):DocumentApp.create('Purpose Driven Journal');if(!docs.hasNext())DriveApp.getFileById(doc.getId()).moveTo(folder);const body=doc.getBody();body.appendParagraph(Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm')).setHeading(DocumentApp.ParagraphHeading.HEADING2);if(entry.categories.length)body.appendParagraph(entry.categories.join(' · '));body.appendParagraph(entry.text);doc.saveAndClose();}
function root_(){const root=DriveApp.getRootFolder();const it=root.getFoldersByName(ROOT);return it.hasNext()?it.next():root.createFolder(ROOT);}
function label_(r){if(r.type==='food')return 'Food: '+r.data.text;if(r.type==='weight')return 'Weight: '+r.data.value+' '+r.data.unit;return 'Exercise: '+(r.data.text||r.data.minutes+' min');}
function date_(value){const s=String(value||'');return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
function verifyProof_(proof){const parts=String(proof||'').split('.');if(parts.length!==2)return null;const secret=PropertiesService.getScriptProperties().getProperty('APP_GATEWAY_SHARED_SECRET');if(!secret)return null;const expected=Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0],secret)).replace(/=+$/,'');if(!constantTime_(expected,parts[1]))return null;const claims=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());const now=Math.floor(Date.now()/1000);if(!claims.sub||!claims.nonce||claims.exp<=now||claims.iat>now||claims.exp-now>300)return null;const cache=CacheService.getScriptCache();const replayKey='nonce:'+claims.nonce;if(cache.get(replayKey))return null;cache.put(replayKey,'1',Math.max(1,claims.exp-now));return claims;}
function constantTime_(a,b){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
function output_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
