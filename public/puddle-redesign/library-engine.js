(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const subjects=["I","You","We","They","He","She","My brother","Our teacher","The students","Anna","Tom","My parents"];
const verbs=[["go","goes"],["study","studies"],["watch","watches"],["play","plays"],["read","reads"],["work","works"],["cook","cooks"],["speak","speaks"],["visit","visits"],["learn","learns"]];
const dailyActions=[["go","to school"],["study","English"],["watch","TV"],["play","football"],["read","books"],["work","at home"],["cook","dinner"],["speak","English"],["visit","my grandparents"],["learn","new words"]];
const listeningActions=["practise for twenty minutes each day","help younger students after class","use a bicycle to travel","keep a notebook of new words","organise activities with friends","check information before sharing it","collect useful ideas from books","take part in a local project","share the results with the group","walk there every Saturday"];
const objects=["English","football","books","the piano","new words","TV","at home","in the library","to school","every morning"];
const names=["Alex","Maya","Daniel","Sara","Olim","Nina","Jack","Madina","Leo","Aziza"];
const places=["the city library","a small village","the science museum","a local market","the school garden","the railway station","a mountain village","the community centre","a modern college","the riverside park"];
const topics=["healthy habits","learning languages","city transport","protecting nature","technology at school","weekend plans","a school project","food and culture","travel experiences","teamwork","reading habits","sports and fitness","online safety","volunteering","future careers","weather and climate","music and art","community life","space exploration","daily routines"];
const details=["walks there every Saturday","helps younger students after class","uses a bicycle to travel","keeps a small notebook of new words","organises activities with friends","checks information before sharing it","practises for twenty minutes each day","collects useful ideas from books","takes part in a local project","shares the results with the group"];
const levels=["A1","A2","B1","B2","C1"];
const grammar = Array.from({length:1200},(_,i)=>{
 const s=subjects[i%subjects.length], v=verbs[Math.floor(i/subjects.length)%verbs.length], o=objects[Math.floor(i/7)%objects.length], n=i%5, lv=levels[Math.floor(i/240)];
 let q,opts,correct,why,topic;
 switch(i%12){
 case 0: {const action=dailyActions[Math.floor(i/12)%dailyActions.length];q=`${s} ___ ${action[1]} every day.`;opts=[action[0],action[0]+"s",action[0]+"ing",action[0]+"ed"];correct=(["He","She","My brother","Our teacher","Anna","Tom"].includes(s)?1:0);topic="Present Simple";why="Present Simple odat va takrorlanadigan ishlar uchun ishlatiladi. He/She/It bilan fe’lga -s yoki -es qo‘shiladi.";break;}
 case 1: q=`${s} ___ at home now.`;opts=["am","is","are","be"];correct=["I"].includes(s)?0:["He","She","My brother","Our teacher","Anna","Tom"].includes(s)?1:2;topic="To be";why="Am — I bilan, is — he/she/it bilan, are — you/we/they bilan ishlatiladi.";break;
 case 2: q=`${s} ___ my grandparents yesterday.`;opts=["visit","visits","visited","visiting"];correct=2;topic="Past Simple";why="Yesterday o‘tgan vaqtni bildiradi. Visit fe’lining Past Simple shakli visited.";break;
 case 3: q=`${s} ___ English at the moment.`;opts=["am studying","is studying","are studying","studied"];correct=["I"].includes(s)?0:["He","She","My brother","Our teacher","Anna","Tom"].includes(s)?1:2;topic="Present Continuous";why="Hozir davom etayotgan ish: am/is/are + verb-ing.";break;
 case 4: q=`I saw ___ interesting book in the library.`;opts=["a","an","the","—"];correct=1;topic="Articles";why="Interesting unli tovush bilan boshlanadi, shuning uchun an ishlatiladi.";break;
 case 5: q=`She has lived here ___ 2021.`;opts=["for","since","during","by"];correct=1;topic="Since and for";why="Since aniq boshlanish nuqtasi bilan ishlatiladi; for vaqt davomiyligini bildiradi.";break;
 case 6: q=`This road is ___ than the old road.`;opts=["wide","wider","widest","the wider"];correct=1;topic="Comparatives";why="Qisqa sifatlarda comparative shakli uchun -er qo‘shiladi.";break;
 case 7: q=`You ___ wear a seat belt in a car.`;opts=["should to","must","can to","would to"];correct=1;topic="Modal verbs";why="Must kuchli majburiyat yoki qoida ma’nosini beradi. Modal fe’ldan keyin to ishlatilmaydi.";break;
 case 8: q=`If it rains, we ___ at home.`;opts=["stay","stayed","will stay","staying"];correct=2;topic="First Conditional";why="First Conditional: If + Present Simple, will + infinitive.";break;
 case 9: q=`The emails ___ every morning.`;opts=["check","are checked","checked","is checking"];correct=1;topic="Passive Voice";why="Present Simple Passive: am/is/are + past participle.";break;
 case 10: q=`There isn't ___ milk in the fridge.`;opts=["many","a few","much","several"];correct=2;topic="Quantifiers";why="Much sanalmaydigan otlar bilan inkor va so‘roq gaplarda ishlatiladi.";break;
 default: q=`By next June, she ___ her English course.`;opts=["finishes","finished","will have finished","is finish"];correct=2;topic="Future Perfect";why="Future Perfect: will have + V3. Kelajakdagi ma’lum vaqtgacha tugaydigan ishni bildiradi.";
 }
 return {id:"g"+i,level:lv,topic,question:q,options:opts,answer:correct,explanation:why};
});

// B2–C1 challenge bank: advanced syntax, inversion, collocation and nuanced grammar.
const advancedGrammar = Array.from({length:1200},(_,i)=>{
 const person=names[i%names.length], topic=topics[Math.floor(i/12)%topics.length], place=places[Math.floor(i/12)%places.length];
 const level=Math.floor(i/12)%2===0?"B2":"C1";
 let question,options,answer,explanation,topicName;
 switch(i%12){
  case 0:
   question=`Rarely ___ such a persuasive explanation of ${topic}.`;
   options=["have I heard","I have heard","did I heard","I had hear"];answer=0;topicName="Inversion";explanation="Rarely gap boshida kelganda yordamchi fe’l egadan oldin keladi: Rarely + have + subject + V3.";break;
  case 1:
   question=`If ${person} had taken the earlier train, they ___ at ${place} now.`;
   options=["would be","would have been","will be","had been"];answer=0;topicName="Mixed Conditionals";explanation="O‘tmishdagi shartning hozirgi natijasi: If + Past Perfect, would + infinitive.";break;
  case 2:
   question=`Had the committee reviewed the evidence earlier, it ___ the error.`;
   options=["would detect","would have detected","will detect","had detected"];answer=1;topicName="Third Conditional";explanation="Had + subject + V3 — if the committee had reviewed shaklining inversiyasi; natija would have + V3.";break;
  case 3:
   question=`It was the detailed report ___ persuaded the panel to reconsider ${topic}.`;
   options=["who","what","that","where"];answer=2;topicName="Cleft Sentences";explanation="It was ... that ... — urg‘u beruvchi cleft sentence tuzilmasi.";break;
  case 4:
   question=`The director insisted that every applicant ___ a written statement about ${topic}.`;
   options=["submits","submit","submitted","will submit"];answer=1;topicName="Subjunctive";explanation="Insist that dan keyin formal subjunctive ishlatiladi: subject + base verb.";break;
  case 5:
   question=`___ by limited funding, ${person}’s team redesigned the ${topic} project.`;
   options=["Restricting","Restricted","To restrict","Having restrict"];answer=1;topicName="Participle Clauses";explanation="Jamoa cheklangan mablag‘ ta’sirida bo‘lgan, shuning uchun past participle bilan qisqartirilgan passive clause ishlatiladi.";break;
  case 6:
   question=`The latest findings are consistent ___ the earlier research into ${topic}.`;
   options=["to","with","for","at"];answer=1;topicName="Dependent Prepositions";explanation="Consistent with — barqaror birikma; undan keyin with predlogi ishlatiladi.";break;
  case 7:
   question=`The proposed changes are expected to ___ a significant impact on ${topic}.`;
   options=["do","make","take","set"];answer=1;topicName="Advanced Collocations";explanation="Make an impact — to‘g‘ri collocation. Do/take/set an impact bu kontekstda ishlatilmaydi.";break;
  case 8:
   question=`The plan was rejected because it was financially ___.`;
   options=["viable","viability","unviable","viably"];answer=2;topicName="Word Formation";explanation="Because it was dan keyin sifat kerak. Unviable — moliyaviy jihatdan amalga oshirib bo‘lmaydigan.";break;
  case 9:
   question=`${person} denied ___ the confidential documents about ${topic}.`;
   options=["to access","access","having accessed","to have access"];answer=2;topicName="Reporting Verbs";explanation="Deny fe’lidan keyin gerund ishlatiladi; o‘tmishda sodir bo‘lgan ish uchun having + V3 mos.";break;
  case 10:
   question=`The archive, ___ dates back to 1890, contains valuable records about ${topic}.`;
   options=["which","that","where","what"];answer=0;topicName="Non-defining Relative Clauses";explanation="Vergul bilan ajratilgan non-defining relative clause ichida which ishlatiladi; that bu vazifada kelmaydi.";break;
  default:
   question=`By December, ${person} ___ on the ${topic} project for five years.`;
   options=["will work","will have been working","has worked","had worked"];answer=1;topicName="Future Perfect Continuous";explanation="Kelajakdagi vaqt nuqtasigacha davom etib keladigan ish: will have been + verb-ing.";
 }
 return {id:"adv"+i,level,topic:topicName,question,options,answer,explanation};
});

const reading=Array.from({length:1200},(_,i)=>{
 const person=names[i%names.length],place=places[Math.floor(i/3)%places.length],topic=topics[Math.floor(i/7)%topics.length],detail=details[Math.floor(i/11)%details.length],lv=levels[Math.floor(i/240)];
 const action=["Last month","Every weekend","This year","At the beginning of the term","On Friday afternoon"][i%5];
 const goal=["to make the neighbourhood cleaner","to help people learn new skills","to understand the subject better","to encourage healthy choices","to bring different generations together"][Math.floor(i/13)%5];
 const passage=`${action}, ${person} visited ${place}. The main activity was connected with ${topic}. ${person} ${detail}, and the group discussed practical ways to improve their work. They decided to continue the project because they wanted ${goal}. At the end, everyone shared one idea and agreed on the next step. The experience showed that small actions can create useful changes when people work together.`;
 const answer=goal, distract=["to win a professional sports competition","to build a new shopping centre","to travel abroad immediately"][i%3];
 return {id:"r"+i,level:lv,title:`${topic[0].toUpperCase()+topic.slice(1)} — text ${i+1}`,passage,question:"Why did the group decide to continue the project?",options:[distract,answer,"to cancel all future meetings","to sell the place"],answer:1,explanation:"Matnda guruh loyihani davom ettirishni xohlagani va uning maqsadi aniq aytilgan."};
});
const listening=Array.from({length:1200},(_,i)=>{
 const person=names[i%names.length],place=places[Math.floor(i/3)%places.length],topic=topics[Math.floor(i/7)%topics.length],detail=details[Math.floor(i/11)%details.length],lv=levels[Math.floor(i/240)];
 const time=["at half past seven","on Saturday morning","after the final lesson","at the end of the month","before dinner"][i%5];
 const reason=["to practise English","to help a neighbour","to prepare a presentation","to learn about local history","to organise a sports event"][Math.floor(i/9)%5];
 const script=`Hello, my name is ${person}. I am calling from ${place}. I will be there ${time}. I am interested in ${topic}, and I usually ${listeningActions[i%listeningActions.length]}. This time I am coming ${reason}. Please bring a notebook and arrive a little early. Thank you, and see you soon.`;
 return {id:"l"+i,level:lv,title:`Listening practice ${i+1}: ${topic}`,script,question:"Why is the speaker going there?",options:["to buy a new phone",reason,"to meet a famous actor","to cancel a lesson"],answer:1,explanation:"Audio matnida sabab: "+reason+" deb aytiladi."};
});
const lessonTopics=["Present Simple","Present Continuous","Past Simple","Present Perfect","Future forms","Articles a/an/the","Prepositions of time","Modal verbs","Comparative adjectives","Superlatives","Countable and uncountable nouns","First Conditional","Second Conditional","Passive Voice","Reported Speech","Relative clauses","Gerunds and infinitives","Question forms","Phrasal verbs","Word formation","Academic vocabulary","Describing people","Describing places","Giving opinions","Agreeing and disagreeing","Making suggestions","Storytelling","Pronunciation: word stress","Pronunciation: connected speech","IELTS Speaking Part 1","IELTS Speaking Part 2","CEFR B1 writing","CEFR B2 writing","Reading for gist","Reading for detail","Listening for numbers","Listening for attitude","Formal emails","Informal messages","Debate skills"];
const videos=Array.from({length:1200},(_,i)=>{
 const topic=lessonTopics[i%lessonTopics.length],lv=levels[Math.floor(i/240)],variant=Math.floor(i/lessonTopics.length)+1;
 const explain=`${topic} mavzusi: ${["kundalik suhbatda","o‘qish va yozishda","imtihonga tayyorgarlikda","ish va ta’lim muhitida","sayohat paytida"][i%5]} qo‘llanadi. ${["Avval asosiy qoida va shaklni o‘rganing.","Misollarni taqqoslab, grammatik farqni aniqlang.","Yangi iboralarni kontekst ichida ishlating.","Gapni tinglang, keyin mustaqil ravishda qayta tuzing.","Xatolarni tahlil qilib, to‘g‘ri variantni mustahkamlang."][i%5]} ${variant}-mashg‘ulotda shu ko‘nikma bosqichma-bosqich mustahkamlanadi.`;
 const example=topic==="Present Simple"?[`I study English every day. She studies English every day.`,`My friends play football on Fridays. My sister reads every night.`][i%2]:topic==="Present Continuous"?[`I am reading now. They are working at the moment.`,`She is preparing for an exam. We are learning new words.`][i%2]:topic==="Past Simple"?[`We visited Samarkand last year. He went to school yesterday.`,`I watched a film last night. They travelled by train.`][i%2]:`Example ${variant}: use ${topic.toLowerCase()} in a short conversation about ${topics[i%topics.length]} and explain your idea in two or three sentences.`;
 return {id:"v"+i,level:lv,topic,title:`${topic} — dars ${variant}`,duration:6+(i%9),explain,example,task:`Variant ${variant}: “${topic}” mavzusida ${topics[i%topics.length]} haqida 3 ta gap tuzing, ularni ovoz chiqarib ayting va bittasiga sabab yoki misol qo‘shing.`};
});
function saved(key){try{return JSON.parse(localStorage.getItem("th_library_"+key)||"{}")}catch{return {}}}
function save(key,data){try{localStorage.setItem("th_library_"+key,JSON.stringify(data))}catch{}}
const module=document.body.dataset.module||"practice";
const titles={practice:"English Practice",cefr:"CEFR Assessment",reading:"Reading Lab",listening:"Listening Lab",videos:"Video Lessons"};
const banks={practice:[...grammar,...advancedGrammar],cefr:[...grammar,...advancedGrammar,...reading.map(x=>({...x,topic:"Reading comprehension"})),...listening.map(x=>({...x,topic:"Listening comprehension"}))],reading,listening,videos};
const bank=banks[module]||grammar;
let filters={level:"all",topic:"all"},items=[],position=0,score=0,locked=false,answers=[],activeLesson=null,videoPage=0;
const progress=saved(module);
function setHeader(){ $("moduleTitle").textContent=titles[module];$("bankCount").textContent=bank.length.toLocaleString("en-US")+"+ ta material";$("completedCount").textContent=(progress.completed||0).toLocaleString("en-US");}
function filtered(){return bank.filter(x=>(filters.level==="all"||x.level===filters.level)&&(filters.topic==="all"||x.topic===filters.topic));}
function setItems(){const pool=filtered();items=pool.slice().sort(()=>Math.random()-.5).slice(0,Math.min(20,pool.length));position=0;score=0;answers=[];locked=false;render();}
function optionButton(text,index){const b=document.createElement("button");b.className="library-option";b.type="button";b.innerHTML=`<span>${String.fromCharCode(65+index)}</span><b>${esc(text)}</b>`;b.addEventListener("click",()=>answer(index));return b;}
function updateProgress(){const pct=items.length?Math.round(position/items.length*100):0;$("libraryProgress").style.width=pct+"%";$("positionLabel").textContent=Math.min(position+1,items.length)+" / "+items.length;}
function answer(index){if(locked)return;locked=true;const item=items[position],correct=index===item.answer;if(correct)score++;answers.push({id:item.id,correct});[...$("options").children].forEach((b,i)=>{b.disabled=true;if(i===item.answer)b.classList.add("correct");if(i===index&&!correct)b.classList.add("wrong")});$("feedback").className="library-feedback "+(correct?"good":"bad");$("feedback").textContent=(correct?"To‘g‘ri! ":"Javob noto‘g‘ri. ")+(item.explanation||"");$("nextButton").disabled=false;$("nextButton").textContent=position===items.length-1?"Natijani ko‘rish":"Keyingi savol →";}
function render(){setHeader();if(!items.length){$("questionCard").hidden=true;$("emptyState").hidden=false;return;}$("emptyState").hidden=true;$("questionCard").hidden=false;const item=items[position];locked=false;$("nextButton").disabled=true;$("nextButton").textContent="Javobni tanlang";$("feedback").textContent="";$("feedback").className="library-feedback";$("questionMeta").textContent=item.level+" · "+(item.topic||item.title||"Mashq");$("questionText").textContent=item.question||item.title;$("options").innerHTML="";(item.options||[]).forEach((o,i)=>$("options").append(optionButton(o,i)));if(module==="reading"||module==="listening"||(module==="cefr"&&(item.passage||item.script))){$("passagePanel").hidden=false;$("passageTitle").textContent=item.title||item.topic||"Matn";$("passageText").textContent=item.passage||item.script||"";$("playScript").hidden=!item.script;}else{$("passagePanel").hidden=true;}updateProgress();}
function finish(){const percent=items.length?Math.round(score/items.length*100):0;progress.completed=(progress.completed||0)+answers.length;progress.lastScore=percent;progress.lastAt=new Date().toISOString();save(module,progress);$("questionCard").hidden=true;$("resultCard").hidden=false;$("resultScore").textContent=score+" / "+items.length;$("resultPercent").textContent=percent+"%";$("resultMessage").textContent=percent>=85?"Ajoyib natija! Keyingi darajaga tayyorlaning.":percent>=60?"Yaxshi! Xatolarni ko‘rib, yana mashq qiling.":"Mavzularni takrorlang va qayta urinib ko‘ring.";$("completedCount").textContent=progress.completed.toLocaleString("en-US");}
function next(){if(!locked)return;if(position<items.length-1){position++;render()}else finish();}
function populateFilters(){const lv=$("levelFilter");levels.forEach(x=>{const o=document.createElement("option");o.value=x;o.textContent=x;lv.append(o)});const topicsList=[...new Set(bank.map(x=>x.topic).filter(Boolean))].sort();topicsList.forEach(x=>{const o=document.createElement("option");o.value=x;o.textContent=x; $("topicFilter").append(o)});}
function speak(text,lang="en-US"){if(!("speechSynthesis"in window)){alert("Brauzeringiz ovozli o‘qishni qo‘llab-quvvatlamaydi.");return;}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=.88;speechSynthesis.speak(u);}
function renderVideos(){const list=$("lessonGrid");list.innerHTML="";const filteredVideos=bank.filter(x=>(filters.level==="all"||x.level===filters.level)&&(filters.topic==="all"||x.topic===filters.topic));const pageSize=60;videoPage=Math.min(videoPage,Math.max(0,Math.ceil(filteredVideos.length/pageSize)-1));$("lessonCount").textContent=filteredVideos.length.toLocaleString("en-US")+" ta dars";filteredVideos.slice(videoPage*pageSize,(videoPage+1)*pageSize).forEach(item=>{const card=document.createElement("button");card.className="lesson-card";card.innerHTML=`<span class="lesson-thumb"><i>▶</i><small>${item.duration} min</small></span><span class="lesson-info"><b>${esc(item.title)}</b><small>${item.level} · ${esc(item.topic)}</small></span>`;card.onclick=()=>openLesson(item);list.append(card)});$("lessonPager").textContent="Sahifa "+(videoPage+1)+" / "+Math.max(1,Math.ceil(filteredVideos.length/pageSize))+" · Jami "+filteredVideos.length.toLocaleString("en-US")+" ta dars.";$("lessonPrev").disabled=videoPage===0;$("lessonNext").disabled=(videoPage+1)*pageSize>=filteredVideos.length;}
function openLesson(item){activeLesson=item;$("lessonPlayer").hidden=false;$("playerTitle").textContent=item.title;$("playerLevel").textContent=item.level+" · "+item.duration+" daqiqa";$("playerExplain").textContent=item.explain;$("playerExample").textContent=item.example;$("playerTask").textContent=item.task;window.scrollTo({top:0,behavior:"smooth"});}
function init(){populateFilters();$("levelFilter").addEventListener("change",e=>{filters.level=e.target.value;if(module==="videos")renderVideos();else setItems()});$("topicFilter").addEventListener("change",e=>{filters.topic=e.target.value;if(module==="videos")renderVideos();else setItems()});$("nextButton").addEventListener("click",next);$("restartButton").addEventListener("click",()=>{ $("resultCard").hidden=true;setItems()});$("playScript").addEventListener("click",()=>speak($("passageText").textContent));$("stopScript").addEventListener("click",()=>speechSynthesis?.cancel());$("playLesson").addEventListener("click",()=>speak([$ ("playerTitle").textContent,$("playerExplain").textContent,$("playerExample").textContent,$("playerTask").textContent].join(". "),"uz-UZ"));$("stopLesson").addEventListener("click",()=>speechSynthesis?.cancel());$("closeLesson").addEventListener("click",()=>{$("lessonPlayer").hidden=true;speechSynthesis?.cancel()});if(module==="videos"){ $("questionCard").hidden=true;$("lessonLibrary").hidden=false;renderVideos();$("lessonPrev").addEventListener("click",()=>{videoPage=Math.max(0,videoPage-1);renderVideos()});$("lessonNext").addEventListener("click",()=>{videoPage++;renderVideos()})}else setItems();}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();