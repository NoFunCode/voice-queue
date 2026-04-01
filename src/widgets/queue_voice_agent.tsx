import {
  CardType,
  renderWidget,
  Rem,
  RichTextInterface,
  RNPlugin,
  usePlugin,
  useRunAsync,
} from '@remnote/plugin-sdk';
import { WidgetLocation } from '@remnote/plugin-sdk';

function readOut(text: string) {
  const utterance = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utterance);
}

async function parseRichText(plugin: RNPlugin, richText?: RichTextInterface, clozeId?: string) {
  return plugin.richText.toString(
    richText?.map((n) => {
      // Replace the cloze rich text element with "blank"
      // if the current card is a cloze and it has the same cloze id
      if (typeof n === 'object' && 'cId' in n) {
        if (clozeId && n?.cId === clozeId) {
          return 'blank';
        }
      }
      return n;
    }) || []
  );
}

async function getFrontText(plugin: RNPlugin, contextRem?: Rem, cardType?: CardType) {
  const isCloze = typeof cardType === 'object' && 'clozeId' in cardType;
  return parseRichText(
    plugin,
    isCloze
      ? (contextRem?.text || []).concat([' ']).concat(contextRem?.backText || [])
      : contextRem?.text,
    isCloze ? cardType.clozeId : undefined
  );
}

async function getBackText(plugin: RNPlugin, contextRem?: Rem, cardType?: CardType) {
  const isCloze = typeof cardType === 'object' && 'clozeId' in cardType;
  return isCloze
    ? parseRichText(
        plugin,
        (contextRem?.text || []).concat([' ']).concat(contextRem?.backText || [])
      )
    : parseRichText(plugin, contextRem?.backText);
}

async function getQuestion(
  plugin: RNPlugin,
  contextRem?: Rem,
  cardType?: CardType
): Promise<string> {
  if (!contextRem || !cardType) return '';

  const isCloze = typeof cardType === 'object' && 'clozeId' in cardType;
  return cardType === 'forward' || isCloze
    ? getFrontText(plugin, contextRem, cardType)
    : getBackText(plugin, contextRem, cardType);
}

function QueueVoiceAgent() {
  const plugin = usePlugin();

  const question = useRunAsync(async () => {
    const widgetContext = (await plugin.widget.getWidgetContext<WidgetLocation.QueueToolbar>()) as
      | { remId?: string; cardId?: string }
      | undefined;

    if (!widgetContext?.remId || !widgetContext?.cardId) return '';

    const contextRem = await plugin.rem.findOne(widgetContext.remId);
    const cardType = await (await plugin.card.findOne(widgetContext.cardId))?.getType();

    return getQuestion(plugin, contextRem ?? undefined, cardType);
  }, []);

  const handleReadOutLoud = () => {
    if (question) {
      readOut(question);
    }
  };

  return <button onClick={handleReadOutLoud}>🔊</button>;
}

renderWidget(QueueVoiceAgent);

// Reads the current question of the flashcard
function readQuestion() {}

// Extract and store the user's answer from the voice input
function storeAnswer() {}

// Shows the answer of the flashcard after the user has given their answer or if they ask to see the answer
function showAnswer() {}

// Grades the user's answer based on how well it matches the correct answer
function gradeAnswer() {}
