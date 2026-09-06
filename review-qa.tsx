import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeI18n } from './src/i18n/i18n';
import './src/styles.css';
import { ReviewStep } from './src/components/ReviewStep';
import { createEmptyDocument, createBlankSchedule } from './src/domain/timetable';
const base = createEmptyDocument();
const initial = {...base,event:{...base.event,name:'TOKYO IDOL DAY',date:'2026-09-12'}, schedules:[
createBlankSchedule({id:'live',artist:'虹色コンフェッティ',startTime:'10:00',endTime:'10:30',stage:'STAGE A',confidence:'high',sourceRegions:[{x:0,y:430,width:300,height:650}]}),
createBlankSchedule({id:'meet',artist:'虹色コンフェッティ',type:'meet_and_greet',startTime:'11:00',endTime:'12:00',booth:'B-2',confidence:'high'}),
createBlankSchedule({id:'second',artist:'月あかりシンドローム',startTime:'12:30',endTime:'13:00',confidence:'low'})]};
function QA(){ const [data,setData]=useState(initial);return <ReviewStep document={data} sourceUrl="/my-timetable/e2e/fixtures/timetable.png" ocrResult={null} onChange={setData} onBack={()=>{}} onNext={()=>{}}/>; }
void initializeI18n().then(() => createRoot(document.getElementById('root')!).render(<QA/>));
