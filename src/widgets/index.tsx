import { declareIndexPlugin, type ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';
import '../index.css'; // import <widget-name>.css

async function onActivate(plugin: ReactRNPlugin) {

  await plugin.settings.registerStringSetting({
    id: 'openai key',
    title: 'OpenAI API Key',
    description: 'Needed to power the voice agent.',
  });

  await plugin.app.registerWidget('queue_voice_agent', WidgetLocation.QueueToolbar, {
    dimensions: {
      height: 'auto',
      width: 'auto',
    },
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
