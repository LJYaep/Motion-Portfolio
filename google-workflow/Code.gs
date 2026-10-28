/* Deploy privately in your Google account; no document IDs or credentials in GitHub.
   The web endpoint accepts requests. The template and generated files stay private. */
const OWNER_EMAILS = ['daniljy.aep@gmail.com', 'denial.aep@gmail.com'];
const SITE_URL = 'https://ljyaep.github.io/Motion-Portfolio/';
const PROJECT_TYPES = {motion:'Motion Graphics / Videos',roblox:'Roblox Building',modelling:'Modelling',discuss:'Discuss first'};
const CURRENCIES = ['SGD','USD','EUR','GBP','AUD','CAD','MYR','JPY','ROBUX'];

function text_(raw, key, limit, required) {
  const value = String(raw[key] || '').trim();
  if ((required && !value) || value.length > limit || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error('Please check ' + key.replace(/_/g, ' ') + '.');
  if (key !== 'message' && /[\r\n]/.test(value)) throw new Error('Please remove line breaks from contact fields.');
  return value;
}
function validateRequest_(raw) {
  if (raw._honey || raw.company_website) throw new Error('Request could not be accepted.');
  const data = {};
  const fields = {name:100,client_group:100,email:254,service:30,message:5000,preferred_contact:20,contact_handle:100,payment_method:20,payment_channel:50,currency:10,budget:30,start_date:10,end_date:10,device_target:50,request_id:100};
  Object.keys(fields).forEach(key => data[key] = text_(raw,key,fields[key],['name','email','service','message','payment_method'].includes(key)));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || !PROJECT_TYPES[data.service]) throw new Error('Please check your email and project type.');
  if (!['cash','robux'].includes(data.payment_method)) throw new Error('Please choose a payment option.');
  data.preferred_contact = data.preferred_contact || 'email';
  if (!['email','discord','instagram'].includes(data.preferred_contact) || (data.preferred_contact !== 'email' && !data.contact_handle)) throw new Error('Please provide your preferred contact details.');
  data.currency = data.payment_method === 'robux' ? 'ROBUX' : data.currency || 'SGD';
  if (!CURRENCIES.includes(data.currency) || (data.payment_method === 'cash' && data.currency === 'ROBUX')) throw new Error('Please check the currency.');
  if (data.budget && !/^\d+(?:\.\d{1,2})?$/.test(data.budget)) throw new Error('Budget must contain numbers only, with up to two decimal places.');
  if (data.payment_method === 'robux' && data.budget) {
    const minimum = data.service === 'motion' ? 6000 : ['roblox','modelling'].includes(data.service) ? 25000 : 0;
    if (!/^\d+$/.test(data.budget) || Number(data.budget) < minimum) throw new Error('Please check the minimum Robux budget for this project.');
  }
  ['start_date','end_date'].forEach(key => {
    if (data[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(data[key]) || new Date(data[key] + 'T00:00:00Z').toISOString().slice(0,10) !== data[key])) throw new Error('Please check the requested dates.');
  });
  if (data.start_date && data.end_date && data.end_date < data.start_date) throw new Error('Finish date must be on or after start date.');
  if (String(raw.review_ack) !== 'yes') throw new Error('Please acknowledge that this is a request for review.');
  if (data.request_id && !/^[A-Za-z0-9_-]{16,100}$/.test(data.request_id)) throw new Error('Please reload the form and try again.');
  data.request_id = data.request_id || Utilities.getUuid();
  return data;
}
function digest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value).map(b => ('0' + ((b+256)%256).toString(16)).slice(-2)).join('');
}
function draftFields_(data) {
  const budget = data.budget ? data.currency + ' ' + data.budget : 'To be discussed';
  return {
    CLIENT_NAME: data.name + (data.client_group ? ' / ' + data.client_group : ''),
    CLIENT_CONTACT: data.email + (data.preferred_contact !== 'email' ? '\nPreferred contact: ' + data.preferred_contact + ' — ' + data.contact_handle : ''),
    PROJECT_TYPE: PROJECT_TYPES[data.service],
    PROJECT_DETAILS: data.message + '\n\nClient proposal for freelancer review\nProposed budget: ' + budget + '\nPayment preference: ' + (data.payment_method === 'robux' ? 'Robux (backup option)' : 'Money (preferred)') + '\nPayment method: ' + (data.payment_channel || 'To be discussed') + '\nDevice requirements: ' + (data.device_target || 'To be discussed') + '\nRequested start: ' + (data.start_date || 'To be discussed') + '\nRequested finish: ' + (data.end_date || 'To be discussed') + '\nReference: ' + data.request_id + '\nScope, dates and price require freelancer approval. Signatures remain blank.',
    START_DATE: data.start_date ? data.start_date + ' (requested; pending review)' : 'To be agreed',
    END_DATE: data.end_date ? data.end_date + ' (requested; pending review)' : 'To be agreed',
    AGREED_SGD_PRICE: 'To be confirmed by freelancer'
  };
}
function replaceFields_(body, values) {
  // Collect original ranges first so client text is never treated as a template token.
  const edits = Object.keys(values).map(key => {
    const range = body.findText('\\{\\{' + key + '\\}\\}');
    if (!range) throw new Error('Template is missing ' + key + '.');
    return {range:range,value:values[key]};
  });
  edits.reverse().forEach(edit => {
    const text = edit.range.getElement().asText(), start = edit.range.getStartOffset(), end = edit.range.getEndOffsetInclusive();
    text.deleteText(start,end);
    text.insertText(start,edit.value);
  });
}
function renderDraft_(data, config) {
  const template = DriveApp.getFileById(config.TEMPLATE_ID), folder = DriveApp.getFolderById(config.OUTPUT_FOLDER_ID);
  if (template.getMimeType() !== MimeType.GOOGLE_DOCS) throw new Error('Template must be converted to Google Docs.');
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE || template.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('Use a private template and output folder.');
  const copy = template.makeCopy('DRAFT LJY agreement ' + data.request_id,folder);
  const doc = DocumentApp.openById(copy.getId());
  replaceFields_(doc.getBody(),draftFields_(data));
  doc.saveAndClose();
  return copy.getId();
}
function attachments_(id, reference) {
  const file = DriveApp.getFileById(id);
  const response = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '/export?mimeType=' + encodeURIComponent('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), {headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken()},muteHttpExceptions:true});
  if (response.getResponseCode() !== 200) throw new Error('Document export failed.');
  return [response.getBlob().setName('DRAFT-LJY-' + reference + '.docx'),file.getAs(MimeType.PDF).setName('DRAFT-LJY-' + reference + '.pdf')];
}
function sendOwnerDraft_(data, id, attachments) {
  // Recipients are fixed; the visitor never receives the agreement or a Drive link.
  MailApp.sendEmail({to:OWNER_EMAILS[0],cc:OWNER_EMAILS[1],replyTo:data.email,name:'LJY enquiries',subject:'DRAFT for review — ' + PROJECT_TYPES[data.service] + ' — ' + data.request_id,body:'New project request. Review this draft before sending it to the client.\n\nClient: ' + data.name + '\nEmail: ' + data.email + '\nPrivate editable draft: https://docs.google.com/document/d/' + id + '/edit\n\nThe client’s proposed budget is in Project Details. The agreed SGD price is left for you to confirm. Requested dates are marked pending review. No signature has been filled.\n\nReference: ' + data.request_id,attachments:attachments});
}
function outcome_(ok, reference) {
  // Only fixed text and validated reference are rendered. No customer details in URLs.
  return HtmlService.createHtmlOutput('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>LJY project request</title></head><body style="font:18px/1.6 Arial;padding:48px;max-width:680px;margin:auto;color:#071630;background:#f4f8ff"><h1>' + (ok ? 'Request received for review' : 'Request not confirmed') + '</h1><p>' + (ok ? 'Your project request has been received. Dani will review the details and send you the agreement separately. Proposed dates and prices are not yet confirmed.' : 'Your request could not be confirmed. Please contact Dani directly and quote the reference below. Do not assume that an agreement has been prepared.') + '</p><p>Reference: ' + reference + '</p><a href="' + SITE_URL + '" target="_top">Return to LJY</a></body></html>').setTitle('LJY project request');
}
function doGet() { return outcome_(false,'Use the enquiry form to submit a new request.'); }
function doPost(event) {
  let reference = 'not-accepted';
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return outcome_(false,'busy-please-retry');
  try {
    if (!event || event.contentLength > 18000) throw new Error('Request is too large.');
    const data = validateRequest_(event.parameter || {}); reference = data.request_id;
    const props = PropertiesService.getScriptProperties(), config = props.getProperties();
    if (!config.TEMPLATE_ID || !config.OUTPUT_FOLDER_ID) throw new Error('Private template is not configured.');
    const key = 'request_' + reference, signature = digest_(JSON.stringify(data));
    let record = config[key] ? JSON.parse(config[key]) : null;
    if (record && record.signature !== signature) throw new Error('Request reference conflicts with changed details.');
    if (record && record.sent) return outcome_(true,reference);
    // Bounded daily workload protects both Gmail quotas and draft storage.
    const day = Utilities.formatDate(new Date(),'UTC','yyyy-MM-dd');
    const countKey = 'daily_' + day, emailKey = 'email_' + day + '_' + digest_(data.email.toLowerCase());
    if (!record && (Number(config[countKey] || 0) >= 15 || Number(config[emailKey] || 0) >= 3)) throw new Error('Daily submission limit reached.');
    if (MailApp.getRemainingDailyQuota() < 3) throw new Error('Daily email quota is temporarily unavailable.');
    if (!record) {
      record = {signature:signature,created:Date.now(),sent:false};
      props.setProperty(key,JSON.stringify(record));
      props.setProperty(countKey,String(Number(config[countKey] || 0)+1));
      props.setProperty(emailKey,String(Number(config[emailKey] || 0)+1));
    }
    if (!record.docId) { record.docId = renderDraft_(data,config); props.setProperty(key,JSON.stringify(record)); }
    const attachments = attachments_(record.docId,reference);
    sendOwnerDraft_(data,record.docId,attachments);
    record.sent = true; props.setProperty(key,JSON.stringify(record));
    // Receipt is plain text, after owner delivery; never attach the agreement.
    if (config.SEND_RECEIPT !== 'false') {
      try { MailApp.sendEmail({to:data.email,replyTo:OWNER_EMAILS[0],name:'LJY enquiries',subject:'LJY project request received',body:'Thank you for your request. Dani will review the details and send the agreement separately. No price, date or booking is confirmed yet.\n\nReference: ' + reference}); }
      catch (_) { console.warn('Visitor receipt could not be queued; owner draft was queued.'); }
    }
    // Remove old idempotency counters to stay within Script Properties limits.
    Object.keys(config).forEach(name => {
      if ((name.startsWith('daily_') || name.startsWith('email_')) && !name.includes(day)) props.deleteProperty(name);
      if (name.startsWith('request_')) { try { if (JSON.parse(config[name]).created < Date.now()-7*86400000) props.deleteProperty(name); } catch (_) {} }
    });
    return outcome_(true,reference);
  } catch (error) {
    console.error('Agreement request failed: ' + String(error.message).slice(0,180));
    return outcome_(false,reference);
  } finally { lock.releaseLock(); }
}
function checkSetup() {
  const config = PropertiesService.getScriptProperties().getProperties();
  if (!config.TEMPLATE_ID || !config.OUTPUT_FOLDER_ID) throw new Error('Set TEMPLATE_ID and OUTPUT_FOLDER_ID in Script Properties.');
  const file = DriveApp.getFileById(config.TEMPLATE_ID), folder = DriveApp.getFolderById(config.OUTPUT_FOLDER_ID);
  if (file.getMimeType() !== MimeType.GOOGLE_DOCS || file.getSharingAccess() !== DriveApp.Access.PRIVATE || folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('Use a private Google Docs template and private folder.');
  MailApp.getRemainingDailyQuota();
  console.log('Private template and email service are available. Deploy and test a real request next.');
}
