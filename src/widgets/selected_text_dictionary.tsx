import { usePlugin, renderWidget, useTracker, SelectionType, RNPlugin } from '@remnote/plugin-sdk';
import React from 'react';
import { WordData, GroupedDefinition } from '../models';
import { PreviewDefinitions } from '../components/PreviewDefinitions';

function cleanSelectedText(s?: string) {
  return (
    s
      // Remove leading and trailing whitespace
      ?.trim()
      // Split on whitespace and take the first word
      ?.split(/(\s+)/)[0]
      // This removes non-alphabetic characters
      // including Chinese characters, Cyrillic etc.
      // But the Dictionary API in this plugin only
      // works with English, so this is okay.
      ?.replaceAll(/[^a-zA-Z]/g, '')
  );
}

// We use the `useDebounce` hook to limit the number of API calls
// made to the dictionary API to avoid getting rate limited by the API
function useDebounce<T>(value: T, msDelay: number) {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, msDelay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, msDelay]);
  return debouncedValue;
}

async function addSelectedDefinition(
  plugin: RNPlugin,
  definition: GroupedDefinition
): Promise<void> {
  // Find the root Rem where we want to add the word defitions as children.
  // Note: findByName with null as the parentId parameter will search only
  // top level rem in the user's knowledgebase! If the root Rem is a child of some
  // rem, findByName will return undefined.
  const rootRemName = (await plugin.settings.getSetting('dictionary root')) as string;
  if (!rootRemName) {
    plugin.app.toast(
      "Dictionary Plugin: Please set the 'Dictionary Root Rem' setting to use this feature."
    );
    return;
  }
  const rootRem = await plugin.rem.findByName([rootRemName], null);

  const word = `${definition.word} (${definition.partOfSpeech})`;
  const definitions = definition.meanings
    .map((meaning) => meaning.definitions.map((def) => def.definition))
    .flat();
  const wordRem = await plugin.rem.createRem();

  if (wordRem) {
    // Set the key to the word.
    // This will show as the question side of the flashcard.
    await wordRem.setText([word]);
    for (const def of definitions) {
      // Add the definitions as children of the wordRem
      // Set each child to be a card item.
      // These will show as the answer side of the flashcard.
      const child = await plugin.rem.createRem();
      await child?.setText([def]);
      await child?.setParent(wordRem._id);
      await child?.setIsCardItem(true);
    }
    // To make the wordRem a child of the rootRem, set its parent
    // to the rootRem.
    await wordRem.setParent(rootRem!._id);
    // Practice the flashcard in both directions
    await wordRem.setPracticeDirection('both');
    // Success!
    plugin.app.toast('Added!');
  } else {
    plugin.app.toast('Failed to save the word to your knowledge base.');
  }
}

function SelectedTextDictionary() {
  const plugin = usePlugin();

  // This stores the response from the dictionary API.
  const [wordData, setWordData] = React.useState<WordData>();

  // By wrapping the call to `useTracker` in
  // `useDebounce`, the `selTextRichText` value will only get set
  // *after* the user has stopped changing the selected text for 0.5 seconds.
  // Since the API gets called every time the value of `selTextRichText` /
  // `selText` change, debouncing limits unnecessary API calls.
  const searchTerm = useDebounce(
    useTracker(async (reactivePlugin) => {
      const sel = await reactivePlugin.editor.getSelection();
      if (sel?.type == SelectionType.Text) {
        return cleanSelectedText(await plugin.richText.toString(sel.richText));
      } else {
        return undefined;
      }
    }),
    500
  );

  // When the selText value changes, and it is not null or undefined,
  // call the dictionary API to get the definition of the selText.
  React.useEffect(() => {
    const getAndSetData = async () => {
      if (!searchTerm) {
        return;
      }
      try {
        const url = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
        const response = await fetch(url + searchTerm);
        const json = await response.json();
        setWordData(Array.isArray(json) ? json[0] : undefined);
      } catch (e) {
        console.log('Error getting dictionary info: ', e);
      }
    };

    getAndSetData();
  }, [searchTerm]);

  return (
    <div className="min-h-[200px] max-h-[500px] overflow-y-scroll m-4">
      {wordData && (
        <PreviewDefinitions
          wordData={wordData}
          onSelectDefinition={(d) => addSelectedDefinition(plugin, d)}
        />
      )}
    </div>
  );
}

renderWidget(SelectedTextDictionary);
