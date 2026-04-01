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
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';

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

function QueueVoiceAgent() {
  const plugin = usePlugin();
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionRef] = useState<{ current: RealtimeSession | null }>({ current: null });

  useAPIEventListener(QueueEvent.QueueExit, undefined, () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
      setIsSessionActive(false);
    }
  });

  const getEphemeralToken = async (): Promise<string> => {
    const apiKey = await plugin.settings.getSetting<string>('openai key');
    if (!apiKey) {
      throw new Error('OpenAI API key not configured in plugin settings');
    }

    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: 'gpt-realtime-1.5',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get ephemeral token: ${response.statusText}`);
    }

    const data = await response.json();
    return data.value;
  };

  const handleStartVoiceSession = async () => {
    if (isSessionActive) {
      plugin.app.toast('Voice session already active');
      return;
    }

    try {
      // Get current card
      const widgetContext = await plugin.widget.getWidgetContext<WidgetLocation.QueueToolbar>();
      const contextRem = await plugin.rem.findOne(widgetContext.remId);

      if (!contextRem) {
        plugin.app.toast('No current card rem found.');
        return;
      }

      const levels = await plugin.settings.getSetting<number>('levels');

      // Get card content
      const hierarchyText = await getHierarchyText(plugin, contextRem, levels);
      const questionText = await getFrontText(plugin, contextRem);
      const answerText = await getBackText(plugin, contextRem);

      // Get ephemeral token
      const token = await getEphemeralToken();

      // Create agent with flashcard-specific instructions
      const agent = new RealtimeAgent({
        name: 'Flashcard Study Assistant',
        instructions: `You are a supportive flashcard study assistant. Your role is to guide the user through flashcard learning:
1. Present the flashcard question in a friendly, encouraging tone
2. Wait for the user to answer via voice
3. After the user gives their answer, respond with "I'll show you the answer now" or similar
4. Then present the correct answer clearly
5. Be conversational and supportive if the user gets an answer wrong
6. Celebrate correct answers to encourage continued learning
7. Keep responses concise and natural

Current flashcard:
Question: ${questionText}
Answer: ${answerText}
Context: ${hierarchyText}

Start by reading the question to the user and ask them to answer.`,
      });

      // Create session
      const session = new RealtimeSession(agent, {
        model: 'gpt-realtime-1.5',
      });

      // Connect
      await session.connect({ apiKey: token });

      sessionRef.current = session;
      setIsSessionActive(true);
      plugin.app.toast('Voice session started. Please answer the question.');
    } catch (error) {
      console.error('Error starting voice session:', error);
      plugin.app.toast(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleStopVoiceSession = async () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
      setIsSessionActive(false);
      plugin.app.toast('Voice session ended.');
    }
  };

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <button
        onClick={handleStartVoiceSession}
        disabled={isSessionActive}
        title="Start voice study session"
        style={{
          opacity: isSessionActive ? 0.5 : 1,
          cursor: isSessionActive ? 'not-allowed' : 'pointer',
        }}
      >
        🎤 Start Voice
      </button>
      {isSessionActive && (
        <button onClick={handleStopVoiceSession} title="Stop voice session">
          ⏹️ Stop
        </button>
      )}
    </div>
  );
}

renderWidget(QueueVoiceAgent);
