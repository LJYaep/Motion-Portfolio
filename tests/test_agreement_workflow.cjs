const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname,'../google-workflow/Code.gs'),'utf8');
const values={TEMPLATE_ID:'private-template',OUTPUT_FOLDER_ID:'private-folder'};
const emails=[];let renders=0;
const dnsFetch=()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({Status:0,Answer:[{type:15,data:'10 mail.example.test.'}]})});
const ctx={UrlFetchApp:{fetch:dnsFetch},console:{warn(){},error(){},log(){}},Date,JSON,MailApp:{getRemainingDailyQuota:()=>100,sendEmail:email=>emails.push(email)},PropertiesService:{getScriptProperties:()=>({getProperties:()=>({...values}),setProperty:(k,v)=>values[k]=v,deleteProperty:k=>delete values[k]})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()],formatDate:()=> '2026-10-28'},HtmlService:{createHtmlOutput:s=>({setTitle:()=>s})}};
vm.createContext(ctx);vm.runInContext(source,ctx);
ctx.renderDraft_=()=>{renders++;return 'private-generated-doc';};ctx.attachments_=()=>['DOCX-blob','PDF-blob'];
const valid={name:'Test visitor',client_group:'Test studio',email:'visitor@example.test',service:'roblox',message:'A detailed sci-fi room.',preferred_contact:'discord',contact_handle:'visitor',payment_method:'cash',payment_channel:'Wise',currency:'SGD',budget:'500.50',start_date:'2026-11-01',end_date:'2026-11-15',device_target:'mobile',review_ack:'yes',request_id:'request-test-12345678'};
const data=ctx.validateRequest_(valid),fields=ctx.draftFields_(data);
assert.throws(()=>ctx.validateRequest_({...valid,start_date:'2026-10-27'}),/Start date must be today or later/);
assert.equal(ctx.validateRequest_({...valid,start_date:'2026-10-28'}).start_date,'2026-10-28');
assert.equal(ctx.validateRequest_({...valid,start_date:''}).start_date,'');
assert.throws(()=>ctx.validateRequest_({...valid,start_date:'',end_date:'2026-10-27'}),/Finish date must be today or later/);
assert(fields.CLIENT_NAME.includes('Test studio'));assert(fields.CLIENT_CONTACT.includes('visitor@example.test'));
assert(fields.PROJECT_DETAILS.includes('SGD 500.50'));assert(fields.PROJECT_DETAILS.includes('Wise'));
assert(fields.START_DATE.includes('pending review'));assert.equal(fields.AGREED_SGD_PRICE,'To be confirmed by freelancer');
for(const bad of [{budget:'1e4'},{budget:'-1'},{budget:'5.123'},{end_date:'2026-10-01'},{review_ack:'no'},{email:'x\nBcc:evil@example.test'},{payment_method:'robux',budget:'200',currency:'ROBUX'}]) assert.throws(()=>ctx.validateRequest_({...valid,...bad}));
const result=ctx.doPost({contentLength:1000,parameter:valid});assert(result.includes('Request received for review'));
assert.equal(emails.length,2);assert.equal(emails[0].to,'daniljy.aep@gmail.com');assert.equal(emails[0].cc,'denial.aep@gmail.com');assert.equal(emails[0].attachments.length,2);
assert.equal(emails[1].to,valid.email);assert.equal(emails[1].attachments,undefined);assert(!emails[1].body.includes('docs.google.com'));
ctx.doPost({contentLength:1000,parameter:valid});assert.equal(emails.length,2);assert.equal(renders,1);
const conflict=ctx.doPost({contentLength:1000,parameter:{...valid,message:'Changed request'}});assert(conflict.includes('Request not confirmed'));assert.equal(emails.length,2);
const invalid=ctx.doPost({contentLength:1000,parameter:{...valid,email:'bad'}});assert(invalid.includes('Request not confirmed'));
console.log('PASS: agreement field mapping, date/payment validation, fixed owner attachments, receipt without agreement, retry deduplication and honest failure. Google transports mocked.');

for (const address of ['person@gmail.com','person+project@outlook.com','person@studio.design','person@school.edu.sg','person@sub.company.com']) assert(ctx.validContactEmail(address));
for (const address of ['no-at','person@gmail','person@@gmail.com','.person@gmail.com','person..name@gmail.com','person@-gmail.com','person@gmail..com','person@gmail.com extra']) assert(!ctx.validContactEmail(address));
ctx.UrlFetchApp.fetch=()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({Status:3})});
assert.throws(()=>ctx.checkEmailDomain_('person@missing.invalid'));
ctx.UrlFetchApp.fetch=()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({Status:0,Answer:[{type:15,data:'0 .'}]})});
assert.throws(()=>ctx.checkEmailDomain_('person@no-mail.example'));
ctx.UrlFetchApp.fetch=()=>({getResponseCode:()=>503});
assert.doesNotThrow(()=>ctx.checkEmailDomain_('person@gmail.com'));
ctx.UrlFetchApp.fetch=dnsFetch;
console.log('PASS: provider-neutral email formats, nonexistent domains, null MX and temporary DNS failure.');

assert(ctx.draftFields_(ctx.validateRequest_({...valid,budget:''})).PROJECT_DETAILS.includes('Proposed budget: Discuss First'));
console.log('PASS: blank budget is recorded as Discuss First.');

assert(ctx.doPost({contentLength:1000,parameter:{...valid,service:'invalid'}}).includes('Please check your email and project type.'));
assert(ctx.doPost({contentLength:1000,parameter:{...valid,review_ack:'no'}}).includes('Please acknowledge that this is a request for review.'));
assert.equal(ctx.publicValidationMessage_(new Error('Private file ID or OAuth token')), '');
assert.equal(ctx.publicValidationMessage_(new Error('<script>alert(1)</script>')), '');
console.log('PASS: actionable validation messages without exposing private errors or markup.');

assert.equal(ctx.validateRequest_({...valid,payment_method:'',currency:'SGD'}).payment_method,'cash');
assert.equal(ctx.validateRequest_({...valid,payment_method:'cash',currency:'ROBUX',budget:'25000'}).payment_method,'robux');
assert.equal(ctx.validateRequest_({...valid,payment_method:'robux',currency:'USD'}).payment_method,'cash');
console.log('PASS: currency determines payment type without a separate payment selector.');

const motionRequest=ctx.validateRequest_({...valid,service:'motion',device_target:'mobile'});
assert.equal(motionRequest.device_target,'');
assert(!ctx.draftFields_(motionRequest).PROJECT_DETAILS.includes('Device requirements:'));
assert(ctx.draftFields_(data).PROJECT_DETAILS.includes('Device requirements: mobile'));
console.log('PASS: motion requests omit Roblox device requirements; Roblox requests retain them.');

const protection={TURNSTILE_SECRET_KEY:'test-only-secret',TURNSTILE_HOSTNAMES:'ljyaep.github.io'};
assert.throws(()=>ctx.verifyTurnstile_({},protection),/complete the security check/);
ctx.UrlFetchApp.fetch=()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({success:false})});
assert.throws(()=>ctx.verifyTurnstile_({'cf-turnstile-response':'test-token'},protection));
for (const response of [{success:true,hostname:'other.example',action:'project_request'},{success:true,hostname:'ljyaep.github.io',action:'other'}]) {
 ctx.UrlFetchApp.fetch=()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(response)});
 assert.throws(()=>ctx.verifyTurnstile_({'cf-turnstile-response':'test-token'},protection));
}
ctx.UrlFetchApp.fetch=()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({success:true,hostname:'ljyaep.github.io',action:'project_request'})});
assert.doesNotThrow(()=>ctx.verifyTurnstile_({'cf-turnstile-response':'test-token'},protection));
ctx.UrlFetchApp.fetch=()=>({getResponseCode:()=>503});
assert.throws(()=>ctx.verifyTurnstile_({'cf-turnstile-response':'test-token'},protection),/temporarily unavailable/);
ctx.UrlFetchApp.fetch=dnsFetch;
console.log('PASS: Turnstile missing/invalid token, hostname/action checks, success and fail-closed provider outage. Siteverify transport mocked.');
