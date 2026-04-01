import {
  QueueEvent,
  WidgetLocation,
  renderWidget,
  useAPIEventListener,
  usePlugin,
  Rem,
  CardType,
  RichTextInterface,
  RNPlugin,
  useTracker,
} from '@remnote/plugin-sdk';
import { OpenAI } from 'openai';
import { useEffect, useState } from 'react';

const getFrontText = async (plugin: RNPlugin, contextRem?: Rem, cardType?: CardType) => {
  const isCloze = typeof cardType === 'object' && 'clozeId' in cardType;
  return parseRichText(
    plugin,
    isCloze
      ? (contextRem?.text || [])?.concat([' ']).concat(contextRem?.backText || [])
      : contextRem?.text,
    isCloze ? cardType.clozeId : undefined
  );
};

const getBackText = async (plugin: RNPlugin, contextRem?: Rem, cardType?: CardType) => {
  const childrenRem = await contextRem?.getChildrenRem();
  const isMultiline =
    ((await Promise.all(childrenRem?.map((q) => q.isCardItem()) || [])).filter(Boolean)?.length ||
      0) > 0;
  const isCloze = typeof cardType === 'object' && 'clozeId' in cardType;

  return isCloze
    ? parseRichText(
        plugin,
        (contextRem?.text || [])?.concat([' ']).concat(contextRem?.backText || []),
        cardType.clozeId
      )
    : isMultiline
      ? parseMultilineText(plugin, childrenRem)
      : parseRichText(plugin, contextRem?.backText);
};

const parseMultilineText = async (plugin: RNPlugin, childrenRem?: Rem[]) => {
  // Go through each child rem and parse the text for any cloze elements,
  // then join with a comma to have pauses between each line
  return (await Promise.all(childrenRem?.map((q) => parseRichText(plugin, q.text)) || [])).join(
    ', '
  );
};

const parseRichText = async (plugin: RNPlugin, richText?: RichTextInterface, clozeId?: string) => {
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
};

async function speak(text: string, apiKey: string, model: string, voice: string) {
  const openai = new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const response = await openai.audio.speech.create({
    model,
    voice,
    input: text,
    response_format: 'mp3',
  });

  // Convert the response to a blob and create an object URL
  const blob = new Blob([await response.arrayBuffer()], { type: 'audio/mpeg' });
  const url = URL.createObjectURL(blob);

  const audio = new Audio(url);
  audio.play();

  // Clean up the object URL when audio finishes
  audio.onended = () => URL.revokeObjectURL(url);
}

function TextToSpeechWidget() {
  const plugin = usePlugin();
  const [flashcard, setFlashcard] = useState<{ front: string; back: string; cardType: CardType }>({
    front: '',
    back: '',
    cardType: 'forward',
  });

  // Get all the settings we need for the TTS API call
  let apiKey = useTracker(() => plugin.settings.getSetting<string>('key'));
  let model = useTracker(() => plugin.settings.getSetting<string>('model'));
  let voice = useTracker(() => plugin.settings.getSetting<string>('voice'));

  const refreshFlashcardText = async () => {
    const widgetContext = await plugin.widget.getWidgetContext<WidgetLocation.QueueToolbar>();

    if (!widgetContext?.remId) {
      setFlashcard({ front: '', back: '', cardType: 'forward' });
      return;
    }

    const [contextRem, card] = await Promise.all([
      plugin.rem.findOne(widgetContext.remId),
      widgetContext.cardId ? plugin.card.findOne(widgetContext.cardId) : undefined,
    ]);
    const cardType = await card?.getType();
    const frontText = await getFrontText(plugin, contextRem, cardType);
    const backText = await getBackText(plugin, contextRem, cardType);
    setFlashcard({ front: frontText, back: backText, cardType: cardType });
  };

  useEffect(() => {
    void refreshFlashcardText();
  }, []);

  useAPIEventListener(QueueEvent.RevealAnswer, undefined, async () => {
    await refreshFlashcardText();
  });

  useAPIEventListener(QueueEvent.QueueEnter, undefined, async () => {
    await refreshFlashcardText();
  });

  useAPIEventListener(QueueEvent.QueueExit, undefined, () => {
    setFlashcard({ front: '', back: '', cardType: 'forward' });
  });

  useAPIEventListener(QueueEvent.QueueCompleteCard, undefined, () => {
    void (async () => {
      // Wait briefly so queue context points at the next card before reading text.
      await new Promise((resolve) => setTimeout(resolve, 250));
      await refreshFlashcardText();
    })();
  });

  const handleSpeak = () => {
    if (!apiKey || !model || !voice) {
      plugin.app.toast(
        'Voice Queue Plugin: Please set the OpenAI API Key, Model, and Voice in the plugin settings to use this feature.'
      );
      return;
    }
    speak(
      flashcard.cardType === 'forward' ? flashcard.front : flashcard.back,
      apiKey,
      model,
      voice
    );
  };

  return <button onClick={handleSpeak}>Start Voice Queue</button>;
}

renderWidget(TextToSpeechWidget);
