/** Stateless user-authorized Drive gateway. Deploy as a NEW standalone Apps Script project. */
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FILE_PREFIX = 'purpose-driven-v2-r';

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const claims = verifyProof_(req.proof);
    if (!claims || typeof req.token !== 'string' || req.token.length < 20) return output_({ok:false,error:'Unauthorized gateway request'});
    if (!['list','read','write'].includes(req.action)) return output_({ok:false,error:'Invalid action'});
    const result = req.action === 'list' ? list_(req.token) : req.action === 'read' ? read_(req.token, req.payload) : write_(req.token, req.payload, claims.sub);
    return output_(Object.assign({ok:true}, result));
  } catch (error) {
    console.error(error);
    return output_({ok:false,error:'Google Drive request failed'});
  }
}
function drive_(url, token, options) {
  const request = Object.assign({muteHttpExceptions:true,headers:{Authorization:'Bearer '+token}}, options || {});
  const response = UrlFetchApp.fetch(url,request);
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw Error('Drive API '+response.getResponseCode());
  return JSON.parse(response.getContentText());
}
function list_(token) {
  const files = [];
  let page = '';
  do {
    const q = "name contains '"+FILE_PREFIX+"' and trashed = false";
    const url = DRIVE_API+'?spaces=appDataFolder&q='+encodeURIComponent(q)+'&fields='+encodeURIComponent('nextPageToken,files(id,name,createdTime,size)')+'&pageSize=1000'+(page?'&pageToken='+encodeURIComponent(page):'');
    const result = drive_(url,token);
    (result.files||[]).forEach(file => { const match = /^purpose-driven-v2-r(\d+)-[\w-]+\.json$/.exec(file.name); if (match) files.push({id:file.id,name:file.name,createdTime:file.createdTime,revision:Number(match[1]),size:file.size}); });
    page = result.nextPageToken || '';
  } while (page);
  return {files:files};
}
function read_(token, payload) {
  const id = String((payload||{}).id||'');
  if (!/^[\w-]{10,}$/.test(id)) throw Error('Invalid file id');
  return {backup:drive_(DRIVE_API+'/'+encodeURIComponent(id)+'?alt=media',token)};
}
function write_(token, payload, owner) {
  const backup = (payload||{}).backup;
  if (!backup || backup.ownerSub !== owner || backup.format !== 'purpose-driven-workspace' || backup.schemaVersion !== 2 || !Number.isSafeInteger(backup.revision) || backup.revision < 0) throw Error('Invalid backup');
  const content = JSON.stringify(backup);
  if (content.length > 4000000) throw Error('Backup exceeds 4 MB');
  const name = FILE_PREFIX+backup.revision+'-'+Utilities.getUuid()+'.json';
  const boundary = 'pd-'+Utilities.getUuid();
  const body = '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify({name:name,mimeType:'application/json',parents:['appDataFolder']})+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+content+'\r\n--'+boundary+'--';
  const result = drive_(DRIVE_UPLOAD+'?uploadType=multipart&fields='+encodeURIComponent('id,name,createdTime'),token,{method:'post',contentType:'multipart/related; boundary='+boundary,payload:body});
  return {file:{id:result.id,name:result.name,createdTime:result.createdTime,revision:backup.revision}};
}
function verifyProof_(proof) {
  const parts = String(proof||'').split('.'); if(parts.length!==2)return null;
  const secret = PropertiesService.getScriptProperties().getProperty('APP_GATEWAY_SHARED_SECRET'); if(!secret)return null;
  const expected = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0],secret)).replace(/=+$/,'');
  if(!constantTime_(expected,parts[1]))return null;
  const claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  const now=Math.floor(Date.now()/1000);
  if(!claims.sub||!claims.nonce||claims.exp<=now||claims.iat>now||claims.exp-now>300)return null;
  const cache=CacheService.getScriptCache(),key='nonce:'+claims.nonce;
  if(cache.get(key))return null;
  cache.put(key,'1',Math.max(1,claims.exp-now));
  return claims;
}
function constantTime_(a,b) { if(a.length!==b.length)return false; let x=0; for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i); return x===0; }
function output_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
