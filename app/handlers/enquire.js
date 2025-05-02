import { TYPE_TRANSLATE } from '../../constants/command.js';
import { t } from '../../locales/index.js';
import { ROLE_AI, ROLE_HUMAN } from '../../services/openai.js';
import { generateCompletion, getCommand } from '../../utils/index.js';
import { ALL_COMMANDS, COMMAND_BOT_CONTINUE, ENQUIRE_COMMANDS } from '../commands/index.js';
import Context from '../context.js';
import { getHistory, updateHistory } from '../history/index.js';
import { getPrompt, setPrompt, Prompt } from '../prompt/index.js';

/**
 * @param {Context} context
 * @returns {boolean}
 */

const SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzRuSGmNmEWc42T7kdCfLoCMg1A1fXrhRW4_weFmoKPJImFmD64PS9y-ayOAWzGZNuy/exec';

async function submitToSheet(data) {
  try {
    const res = await fetch(SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  } catch (err) {
    console.error('送出失敗:', err);
    return err;
  }
}
const check = (context) => (
  context.trimmedText.includes("我要預約") ||
  [...ENQUIRE_COMMANDS]
    .sort((a, b) => b.text.length - a.text.length)
    .some((command) => context.hasCommand(command))
);

/**
 * @param {Context} context
 * @returns {Promise<Context>}
 */
const exec = (context) => check(context) && (
  async () => {
/*
    if (context.event.isText && context.trimmedText.includes("我要預約")) {
      context.pushText("請提供以下資訊：\n1. 姓名\n2. 課程名稱\n3. 預約時間\n4. 聯絡方式");
      return context; // 不繼續走 GPT 回應流程
    }
*/
    // 若使用者已經開始預約流程，直接跳過
    if (context.session.bookingStep) {
      // 這裡是處理使用者一次輸入所有預約資料
      if (context.event.isText) {
        const inputText = context.trimmedText;

        // 假設用 ":" 分隔每一個項目
        const data = {};
        const lines = inputText.split('\n');
        
        lines.forEach(line => {
          const [key, value] = line.split(':').map(str => str.trim());
          if (key && value) {
            data[key] = value;
          }
        });

        // 檢查必須資料是否已填
        if (data['姓名'] && data['課程名稱'] && data['預約時間'] && data['聯絡方式']) {
          // 裝上 userId
          data.userId = context.source.userId;
          
          // ✅ 寫入 Google Sheet
          //await submitToSheet(data);

          context.pushText("✅ 預約完成，謝謝您的填寫！");
          delete context.session.bookingStep;
          delete context.session.bookingData;
        } else {
          context.pushText("⚠️ 請確認資料完整：\n1. 姓名\n2. 課程名稱\n3. 預約時間\n4. 聯絡方式");
        }
        return context;
      }
    }

    
    updateHistory(context.id, (history) => history.erase());
    const command = getCommand(context.trimmedText);
    const history = getHistory(context.id);
    if (!history.lastMessage) return context;
    const reference = command.type === TYPE_TRANSLATE ? history.lastMessage.content : history.toString();
    const content = `${command.prompt}\n${t('__COMPLETION_QUOTATION_MARK_OPENING')}\n${reference}\n${t('__COMPLETION_QUOTATION_MARK_CLOSING')}`;
    const partial = (new Prompt()).write(ROLE_HUMAN, content);
    const prompt = getPrompt(context.userId);
    prompt.write(ROLE_HUMAN, content).write(ROLE_AI);
    try {
      const { text, isFinishReasonStop } = await generateCompletion({ prompt: partial });
      prompt.patch(text);
      if (!isFinishReasonStop) prompt.write('', command.type);
      setPrompt(context.userId, prompt);
      const defaultActions = ALL_COMMANDS.filter(({ type }) => type === command.type);
      const actions = isFinishReasonStop ? defaultActions : [COMMAND_BOT_CONTINUE];
      context.pushText(text, actions);
    } catch (err) {
      context.pushError(err);
    }
    return context;
  }
)();

export default exec;
