import {
  CardType,
  QueueEvent,
  Rem,
  RichTextInterface,
  RNPlugin,
  renderWidget,
  useAPIEventListener,
  usePlugin,
  WidgetLocation,
} from '@remnote/plugin-sdk';
import { useState } from 'react';

const PARENT_LEVELS_TO_INCLUDE = 3;

function speak(text: string) {
  const normalized = text.trim();
  if (!normalized) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(normalized);
  window.speechSynthesis.speak(utterance);
}

async function parseRichText(
  plugin: RNPlugin,
  richText?: RichTextInterface,
  clozeId?: string
): Promise<string> {
  return plugin.richText.toString(
    richText?.map((n) => {
      if (typeof n === 'object' && 'cId' in n && clozeId && n.cId === clozeId) {
        return 'blank';
      }
      return n;
    }) || []
  );
}

async function parseMultilineText(plugin: RNPlugin, childrenRem: Rem[] = []): Promise<string> {
  const text = await Promise.all(childrenRem.map((child) => parseRichText(plugin, child.text)));
  return text.filter(Boolean).join(', ');
}

async function getFrontText(
  plugin: RNPlugin,
  contextRem?: Rem,
  cardType?: CardType
): Promise<string> {
  const isCloze = typeof cardType === 'object' && 'clozeId' in cardType;
  return parseRichText(
    plugin,
    isCloze
      ? (contextRem?.text || []).concat([' ']).concat(contextRem?.backText || [])
      : contextRem?.text,
    isCloze ? cardType.clozeId : undefined
  );
}

async function getBackText(
  plugin: RNPlugin,
  contextRem?: Rem,
  cardType?: CardType
): Promise<string> {
  const childrenRem = (await contextRem?.getChildrenRem()) || [];
  const isMultiline =
    ((await Promise.all(childrenRem.map((child) => child.isCardItem()))).filter(Boolean).length ||
      0) > 0;
  const isCloze = typeof cardType === 'object' && 'clozeId' in cardType;

  if (isCloze) {
    return parseRichText(
      plugin,
      (contextRem?.text || []).concat([' ']).concat(contextRem?.backText || [])
    );
  }

  return isMultiline
    ? parseMultilineText(plugin, childrenRem)
    : parseRichText(plugin, contextRem?.backText);
}

async function getCurrentCardText(
  plugin: RNPlugin,
  contextRem: Rem,
  cardId: string,
  showAnswer: boolean
): Promise<string> {
  const card = await plugin.card.findOne(cardId);
  const cardType = await card?.getType();
  const isCloze = typeof cardType === 'object' && 'clozeId' in cardType;

  const frontText = await getFrontText(plugin, contextRem, cardType);
  const backText = await getBackText(plugin, contextRem, cardType);

  if (showAnswer) {
    return cardType === 'forward' || isCloze ? backText : frontText;
  }

  return cardType === 'forward' || isCloze ? frontText : backText;
}

async function getHierarchyText(plugin: RNPlugin, rem: Rem, parentLevels: number): Promise<string> {
  const pathTexts: string[] = [];
  let current: Rem | undefined = await rem.getParentRem();

  for (let i = 0; i < parentLevels && current; i += 1) {
    const label = (await parseRichText(plugin, current.text)).trim();
    if (label) pathTexts.push(label);
    current = await current.getParentRem();
  }

  return pathTexts.reverse().join(' > ');
}

function QueueVoiceAgent() {
  const plugin = usePlugin();
  const [showAnswer, setShowAnswer] = useState(false);

  useAPIEventListener(QueueEvent.RevealAnswer, undefined, () => {
    setShowAnswer(true);
  });

  useAPIEventListener(QueueEvent.QueueCompleteCard, undefined, () => {
    setShowAnswer(false);
  });

  useAPIEventListener(QueueEvent.QueueEnter, undefined, () => {
    setShowAnswer(false);
  });

  useAPIEventListener(QueueEvent.QueueExit, undefined, () => {
    setShowAnswer(false);
  });

  const handleReadOutLoud = async () => {
    const widgetContext = await plugin.widget.getWidgetContext<WidgetLocation.QueueToolbar>();
    const contextRem = await plugin.rem.findOne(widgetContext.remId);

    if (!contextRem) {
      plugin.app.toast('No current card rem found to speak.');
      return;
    }

    const hierarchyText = await getHierarchyText(plugin, contextRem, PARENT_LEVELS_TO_INCLUDE);
    const cardText = await getCurrentCardText(plugin, contextRem, widgetContext.cardId, showAnswer);

    const speechText = [hierarchyText, cardText].filter(Boolean).join('. ');
    speak(speechText);
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