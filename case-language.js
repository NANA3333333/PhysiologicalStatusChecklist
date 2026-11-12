// Printed labels only. Never translate the user's written values or quote anchors.
export const EN_CHECKLIST = {
    temperature: ['Temperature', ['Normal','Low','High','Irregular']],
    breathing: ['Breathing', ['Steady','Rapid','Shallow','Abnormal']],
    circulation: ['Circulation', ['Stable','Fast','Weak','Irregular']],
    energy: ['Energy reserve', ['Adequate','Low','Depleted','Recovering']],
    pain: ['Pain response', ['No obvious pain','Mild','Severe','Stimulus-related']],
    risk: ['Risk level', ['Low risk','Observe','High risk','No contact']],
    tissue: ['Skin / tissue', ['Intact','Red / swollen','Laceration','Unusual repair']],
    anomaly: ['4D anomaly', ['None','Mild','Marked','Spreading']],
    cognition: ['Cognition', ['Clear','Slow','Confused','Nonhuman logic']],
    learning: ['Learning / memory', ['Not observed','In progress','Established','Inconsistent']],
    mental: ['Mental state', ['Awake','Alert','Frightened','Confused']],
    mobility: ['Mobility', ['Can stand','Can walk','Can crawl','Limited']],
    senses: ['Sensation', ['Normal','Heightened','Reduced','Unusual response']],
    communication: ['Communication', ['Nonverbal','Vocal sounds','Short phrases','Fluent']],
    intake: ['Intake', ['Normal','Small amount','Refused','Abnormal']],
    rest: ['Rest / sleep', ['Normal','Light sleep','No sleep','Easily woken']],
    stability: ['3D stability', ['Stable','Unstable','Local anomaly']],
    selfCare: ['Self-care', ['Independent','Partial','Unable']],
    boundary: ['Boundaries', ['Can stop','Testing limits','Cannot understand']],
    adaptation: ['Social adaptation', ['Good','Partial','Insufficient']],
    posture: ['Posture', ['Standing','Sitting / lying','Curled up','Unbalanced']],
    activity: ['Activity', ['Still','Low','Normal','Excessive']],
    stress: ['Stress response', ['Stable','Vigilant','Avoidant','Aggressive']],
    touchTolerance: ['Touch tolerance', ['Accepts touch','Local avoidance','Strong avoidance','Unresponsive']],
    hygiene: ['Hygiene', ['Clean','Needs help','Refuses cleaning','Not treated']],
    secretion: ['Secretions', ['None','Small amount','Marked','Abnormal']],
    excretion: ['Excretion', ['Normal','Reduced','Abnormal','Not recorded']],
    muscleTone: ['Muscle tone', ['Normal','Tense','Relaxed','Spasm']],
};

const PRINT_EN = {
    '病例记录 / 人形拟态观察表':'CASE FILE / HUMANOID OBSERVATION', '人形身体检查表':'Humanoid Examination',
    '当前身体状况、行为反应及损伤记录':'Physical condition, behavior and injury record',
    '报告状态':'REPORT STATUS','历史记录':'Historical','当前记录':'Current',
    '受检对象':'Subject','记录日期':'Date','成长周期':'Growth stage','当前形态':'Current form',
    '基本信息':'General condition','一般观察':'Observations','身体状态':'Physical condition','当前驱动':'Current drive','观察重点':'Focus',
    '边界与处置':'Response & care','反应 / 处置':'Response / care','处置记录':'Care plan','医嘱 / 备注':'Notes','补充记录':'Additional notes','观察补记':'Observation notes',
    '身体轮廓与损伤定位':'Body & injury map','红色 × = 已记录损伤':'Red × = recorded injury','正面 / 人形拟态':'FRONT / HUMANOID','损伤定位图':'Injury map',
    '图示定位与损伤记录相互核对；未记录损伤时不作标记。':'Map follows the injury record; unrecorded injuries are not marked.',
    '损伤记录':'Injury record','当前伤情':'Current findings','当前损伤':'Injury findings','组织与异常':'Tissue & anomalies','外观 / 四维反应':'Appearance / 4D response',
    '认知与学习':'Cognition & learning','当前处理能力':'Current capacity','主诉 / 自由记录':'Free notes','横线补记':'Additional notes',
    '专项检查':'Clinical observations','勾选项目':'Check all observed','形态与适应':'Form & adaptation','成长记录':'Development',
    '行为与反应':'Behavior & response','追加观察':'Further observations','卫生与生理':'Hygiene & physiology','护理观察':'Care observations',
    '检查记录':'Record','随当前聊天保存':'Saved with this chat','记录者：':'Written by:','检查结果仅用于表格，随当前聊天保存':'For this form only; saved with the current chat',
    '检查字段折叠在正文下方，仅供表格查看':'Case fields are folded below the reply; for this form only',
    '检查字段只用于表格，随当前聊天保存':'Case fields are saved with this chat for display only',
    '观察档案 / DAILY CHECK-IN':'OBSERVATION LOG / DAILY CHECK-IN','每日检查签到表':'Daily Check-in',
    '按剧情日期归档每日复查完成情况':'Follow-up observations by story date','已签到':'CHECK-INS','最近日期':'Latest date',
    '序':'No.','剧情日期':'Story date','成长 / 形态':'Stage / form','每日复查':'Daily checks','完成度':'Recorded','当日摘要':'Summary',
    '登记规则':'Recording rules','同一剧情日合并为一行；跨日建立新行。勾选表示当日至少记录过该组中的一项检查。':'One row per story day. A check means at least one item in that group was recorded that day.',
    '日期档案 / 随聊天保存':'Dated records / saved with chat','签到表 01':'LOG 01',
    '基本':'General','基础':'General','损伤':'Injury','行为':'Behavior','护理':'Care','生理':'Physiology','认知':'Cognition','适应':'Adaptation',
    '清醒':'Awake','正常':'Normal','偏低':'Low','偏高':'High','异常':'Abnormal','平稳':'Steady','急促':'Rapid','浅弱':'Shallow',
    '稳定':'Stable','偏快':'Fast','偏弱':'Weak','充足':'Adequate','不足':'Low','枯竭':'Depleted','恢复中':'Recovering',
    '无明显':'No obvious pain','轻微':'Mild','明显':'Marked','刺激性':'Stimulus-related','低风险':'Low risk','需观察':'Observe','高风险':'High risk','不可接触':'No contact',
    '完整':'Intact','红肿':'Red / swollen','裂伤':'Laceration','异常修复':'Unusual repair','无':'None','扩散':'Spreading',
    '清楚':'Clear','迟缓':'Slow','混乱':'Confused','非人类逻辑':'Nonhuman logic','未出现':'Not observed','进行中':'In progress','已形成':'Established','反复':'Inconsistent',
    '警觉':'Alert','惊恐':'Frightened','可站立':'Can stand','可行走':'Can walk','可爬行':'Can crawl','受限':'Limited',
    '敏锐':'Heightened','迟钝':'Reduced','异常刺激反应':'Unusual response','无语言':'Nonverbal','声音':'Vocal sounds','短句':'Short phrases','流畅':'Fluent',
    '少量':'Small amount','拒绝':'Refused','浅眠':'Light sleep','未休眠':'No sleep','易醒':'Easily woken',
    '不稳定':'Unstable','局部异常':'Local anomaly','可独立':'Independent','部分':'Partial','无法':'Unable','可停止':'Can stop','持续试探':'Testing limits','无法理解':'Cannot understand','良好':'Good',
    '站立':'Standing','坐卧':'Sitting / lying','蜷缩':'Curled up','失衡':'Unbalanced','静止':'Still','过度':'Excessive','警戒':'Vigilant','逃避':'Avoidant','攻击':'Aggressive',
    '可接触':'Accepts touch','局部回避':'Local avoidance','强烈回避':'Strong avoidance','无反应':'Unresponsive',
    '清洁':'Clean','需协助':'Needs help','拒绝清洁':'Refuses cleaning','未处理':'Not treated','减少':'Reduced','未记录':'Not recorded','紧张':'Tense','松弛':'Relaxed','痉挛':'Spasm',
    '关闭人形身体检查表':'Close examination','关闭每日检查签到表':'Close daily log','人形拟态扫描轮廓':'Humanoid outline','人物正面轮廓图':'Front view of humanoid','损伤标记':'Injury marks',
};

export function printedText(text,language) {
    if(language!=='en')return text;
    const key=text.trim();
    if(PRINT_EN[key])return text.replace(key,PRINT_EN[key]);
    if(/^\d+ 日$/.test(key))return key.replace(' 日',' days');
    return text;
}

export function localizePaper(root,language='zh') {
    root.lang=language==='en'?'en':'zh-CN';root.dataset.caseLanguage=language;
    if(language!=='en')return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){
        if(node.parentElement.closest('[data-u4d-writing="true"]')){
            if(node.nodeValue==='未记录')node.nodeValue='Not recorded';
            continue;
        }
        if(node.parentElement.closest('.u4d-case-validation,script,style,svg'))continue;
        node.nodeValue=printedText(node.nodeValue,language);
    }
    for(const element of root.querySelectorAll('[aria-label],[alt]'))for(const attr of ['aria-label','alt']){
        if(element.hasAttribute(attr))element.setAttribute(attr,printedText(element.getAttribute(attr),language));
    }
}
