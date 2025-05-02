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
    return null;
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
/**
    if (context.event.isText && context.trimmedText.includes("我要預約")) {
      context.pushText("請提供以下資訊：\n1. 姓名\n2. 課程名稱\n3. 預約時間\n4. 聯絡方式");
      return context; // 不繼續走 GPT 回應流程
    }
*/ 
    // ✅ 預約流程處理
    if (!context.session.bookingStep) {
      if (context.event.isText && context.trimmedText.includes("我要預約")) {
        context.session.bookingStep = 1;
        context.session.bookingData = {};
        context.pushText("請輸入您的姓名：");
        return context;
      }
    }

    if (context.session.bookingStep === 1) {
      context.session.bookingData.name = context.trimmedText;
      context.session.bookingStep = 2;
      context.pushText("請輸入課程名稱：");
      return context;
    }

    if (context.session.bookingStep === 2) {
      context.session.bookingData.course = context.trimmedText;
      context.session.bookingStep = 3;
      context.pushText("請輸入預約時間：");
      return context;
    }

    if (context.session.bookingStep === 3) {
      context.session.bookingData.time = context.trimmedText;
      context.session.bookingStep = 4;
      context.pushText("請輸入聯絡方式：");
      return context;
    }

    if (context.session.bookingStep === 4) {
      context.session.bookingData.contact = context.trimmedText;
      context.session.bookingData.userId = context.source.userId;

      // ✅ 寫入 Google Sheet
      await submitToSheet(context.session.bookingData);

      context.pushText("✅ 預約完成，謝謝您的填寫！");
      delete context.session.bookingStep;
      delete context.session.bookingData;
      return context;
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
