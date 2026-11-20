import fs from 'node:fs';
import path from 'node:path';
const root=path.join(process.cwd(),"public/puddle-redesign");
const required=["index.html","styles.css","app.js","manifest.json","sw.js","reading.html","listening.html","english-practice.html","cefr-assessment.html","video-lessons.html"];
for(const f of required){if(!fs.existsSync(path.join(root,f))||!fs.statSync(path.join(root,f)).size)throw Error("Missing/empty: "+f);}
const html=fs.readFileSync(path.join(root,"index.html"),"utf8"),js=fs.readFileSync(path.join(root,"app.js"),"utf8");
const mustHaveIds=["homeView","chatView","practiceView","profileView","chatMessages","chatForm","chatInput","sendBtn","accountAccessCard","learnerName","profileName","profileEmail","accessTitle","accessBadge","accessProgress","menuToggle","themeToggle","menuLogout","clearChat","voiceShortcut"];
for(const id of mustHaveIds){if(!html.includes('id="'+id+'"'))throw Error("Required UI id missing: "+id);}
for(const route of ["/api/chat","/api/me","/api/auth/logout"]){if(!js.includes(route))throw Error("API integration missing: "+route);}
for(const feature of ["th_auth_token","Authorization","data-prompt","serviceWorker.register"]){if(!js.includes(feature))throw Error("App behavior missing: "+feature);}
if(/Upper Intermediate.{0,30}75%|75%.{0,30}Upper Intermediate/.test(html))throw Error("Found demo learner progress in homepage");
const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
if(!manifest.name||!manifest.start_url||!manifest.icons?.length)throw Error("PWA manifest incomplete");
console.log("Smoke check passed: "+required.length+" assets, "+mustHaveIds.length+" UI hooks, API auth/chat, PWA manifest.");
