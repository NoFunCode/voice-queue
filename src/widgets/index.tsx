import { declareIndexPlugin, type ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';
import '../index.css'; // import <widget-name>.css

async function onActivate(plugin: ReactRNPlugin) {
  await plugin.settings.registerStringSetting({
    id: 'key',
    title: 'OpenAI API Key',
    description: 'Needed to power OpenAI text-to-speech playback.',
  });

  await plugin.settings.registerNumberSetting({
    id: 'levels',
    title: 'Parent Levels to Include',
    description:
      'Number of parent levels to include when the agent is presented with the flashcard content.',
    defaultValue: 3,
  });

  await plugin.settings.registerNumberSetting({
    id: 'think seconds',
    title: 'Think Time Seconds',
    description: 'How many seconds to wait before reading the answer out loud.',
    defaultValue: 8,
  });

  await plugin.settings.registerStringSetting({
    id: 'model',
    title: 'OpenAI TTS Model',
    description: 'OpenAI speech model id. Example: gpt-4o-mini-tts',
    defaultValue: 'gpt-4o-mini-tts',
  });

  await plugin.settings.registerStringSetting({
    id: 'voice',
    title: 'OpenAI TTS Voice',
    description: 'OpenAI speech voice. Example: alloy',
    defaultValue: 'alloy',
  });

  await plugin.app.registerWidget('queue_voice_tts', WidgetLocation.QueueToolbar, {
    dimensions: {
      height: 'auto',
      width: 'auto',
    },
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
