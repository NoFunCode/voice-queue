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
import { useRef, useState } from 'react';
import OpenAI from 'openai';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function triggerShowAnswerAction(): boolean {
  const buttonCandidates = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
  const matchingButton = buttonCandidates.find((button) => {
    const label = `${button.textContent || ''} ${button.getAttribute('aria-label') || ''}`
      .toLowerCase()
      .trim();
    return label.includes('show answer') || label.includes('reveal answer');
  });

  if (matchingButton) {
    matchingButton.click();
    return true;
  }

  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement) {
    activeElement.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        bubbles: true,
      })
    );
    activeElement.dispatchEvent(
      new KeyboardEvent('keyup', {
        key: ' ',
        code: 'Space',
        bubbles: true,
      })
    );
    return true;
  }

  return false;
}

async function speak(
  text: string,
  apiKey: string,
  model: string,
  voice: string,
  instructions?: string
) {
  const openai = new OpenAI({ apiKey });
  const response = await openai.audio.speech.create({
    model,
    voice,
    input: text,
    instructions,
    response_format: 'wav',
  });

  console.log('TTS response:', response);
}

function QueueVoiceAgent() {
  const plugin = usePlugin();
  const [isModeActive, setIsModeActive] = useState(false);
  const [status, setStatus] = useState('Idle');
  const runIdRef = useRef(0);
  const isModeActiveRef = useRef(false);

  const stopMode = (showToast: boolean) => {
    isModeActiveRef.current = false;
    setIsModeActive(false);
    setStatus('Stopped');
    runIdRef.current += 1;
    if (showToast) {
      plugin.app.toast('TTS study mode stopped.');
    }
  };

  const runCurrentCardCycle = async () => {
    const runId = runIdRef.current;

    if (!isModeActiveRef.current) return;

    try {
      setStatus('Preparing card');

      const widgetContext = await plugin.widget.getWidgetContext<WidgetLocation.QueueToolbar>();
      const contextRem = await plugin.rem.findOne(widgetContext.remId);

      if (!contextRem) {
        setStatus('No card context');
        plugin.app.toast('No current card rem found.');
        return;
      }

      const levels = await plugin.settings.getSetting<number>('levels');
      const thinkSeconds = await plugin.settings.getSetting<number>('think seconds');
      const apiKey = await plugin.settings.getSetting<string>('key');
      const model = await plugin.settings.getSetting<string>('model');
      const voice = await plugin.settings.getSetting<string>('voice');

      const hierarchyText = await getHierarchyText(plugin, contextRem, levels);
      const questionText = await getFrontText(plugin, contextRem);
      const answerText = await getBackText(plugin, contextRem);

      if (runId !== runIdRef.current || !isModeActiveRef.current) return;

      // Read context and question
      setStatus('Reading context and question');
      if (apiKey) {
        try {
          const contextQuestion = hierarchyText
            ? `${hierarchyText}. ${questionText}`
            : questionText;
          await speak(contextQuestion, apiKey, model, voice);
        } catch (error) {
          console.error('Error speaking context/question:', error);
        }
      }

      if (runId !== runIdRef.current || !isModeActiveRef.current) return;

      // Think time
      if (thinkSeconds > 0) {
        setStatus(`Thinking for ${thinkSeconds} seconds`);
        await sleep(thinkSeconds * 1000);
      }

      if (runId !== runIdRef.current || !isModeActiveRef.current) return;

      // Reveal and read answer
      setStatus('Revealing answer');
      const revealTriggered = triggerShowAnswerAction();
      if (!revealTriggered) {
        plugin.app.toast('Could not auto-click Show Answer. Please reveal manually.');
      }
      await sleep(150);

      if (runId !== runIdRef.current || !isModeActiveRef.current) return;

      setStatus('Reading answer');
      if (apiKey) {
        try {
          await speak(answerText, apiKey, model, voice);
        } catch (error) {
          console.error('Error speaking answer:', error);
        }
      }

      if (runId !== runIdRef.current || !isModeActiveRef.current) return;

      setStatus('Waiting for manual grade');
    } catch (error) {
      console.error('TTS card cycle failed:', error);
      setStatus('Error');
      plugin.app.toast(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      stopMode(false);
    }
  };

  useAPIEventListener(QueueEvent.QueueExit, undefined, () => {
    stopMode(false);
  });

  useAPIEventListener(QueueEvent.QueueCompleteCard, undefined, () => {
    if (!isModeActiveRef.current) return;

    setStatus('Card graded. Loading next card');
    const currentRunId = runIdRef.current;
    void (async () => {
      await sleep(250);
      if (!isModeActiveRef.current || currentRunId !== runIdRef.current) return;
      await runCurrentCardCycle();
    })();
  });

  const handleStartMode = async () => {
    if (isModeActiveRef.current) {
      plugin.app.toast('TTS study mode is already active.');
      return;
    }

    isModeActiveRef.current = true;
    setIsModeActive(true);
    setStatus('Starting');
    runIdRef.current += 1;

    try {
      const widgetContext = await plugin.widget.getWidgetContext<WidgetLocation.QueueToolbar>();
      const contextRem = await plugin.rem.findOne(widgetContext.remId);

      if (!contextRem) {
        stopMode(false);
        plugin.app.toast('No current card rem found.');
        return;
      }

      plugin.app.toast('TTS study mode started.');
      await runCurrentCardCycle();
    } catch (error) {
      stopMode(false);
      console.error('Error starting TTS study mode:', error);
      plugin.app.toast(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleStopMode = async () => {
    stopMode(true);
  };

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <button
        onClick={handleStartMode}
        disabled={isModeActive}
        title="Start TTS study mode"
        style={{
          opacity: isModeActive ? 0.5 : 1,
          cursor: isModeActive ? 'not-allowed' : 'pointer',
        }}
      >
        Start TTS Mode
      </button>
      {isModeActive && (
        <button onClick={handleStopMode} title="Stop TTS study mode">
          Stop
        </button>
      )}
      <span style={{ alignSelf: 'center' }}>{status}</span>
    </div>
  );
}

renderWidget(QueueVoiceAgent);
