import React from 'react';
import { WordData, GroupedDefinition } from '../models';

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const groupBy = <T, K extends keyof any>(list: T[], getKey: (item: T) => K) =>
  list.reduce((previous, currentItem) => {
    const group = getKey(currentItem);
    if (!previous[group]) previous[group] = [];
    previous[group].push(currentItem);
    return previous;
  }, {} as Record<K, T[]>);

interface WordPreviewProps {
  wordData: WordData;
  onSelectDefinition: (d: GroupedDefinition) => void;
}

export const PreviewDefinitions: React.FC<WordPreviewProps> = (props) => {
  const { word, phonetics, meanings } = props.wordData;
  const phonetic = phonetics[0];
  const audio = phonetic?.audio;
  const groupedMeanings = groupBy(meanings, (x) => x.partOfSpeech);
  return (
    <div>
      <div className="flex flex-row items-center mb-4">
        <div className="mr-3 text-lg font-semibold">{capitalize(word)}</div>
        {audio && (
          <div
            className="w-4 h-4 cursor-pointer"
            onClick={() => new Audio(audio).play()}
          >
            🔊
          </div>
        )}
      </div>
      {Object.entries(groupedMeanings)
        .map(([partOfSpeech, meanings]) => (
          <div className="mb-4">
            <div className="flex flex-row items-center mb-3">
              <div className="text-base font-medium mr-3">{partOfSpeech}</div>
              <div
                className="w-4 h-4 cursor-pointer"
                onClick={() =>
                  props.onSelectDefinition({
                    word,
                    phonetic,
                    meanings,
                    partOfSpeech,
                  })
                }
              >
                💾
              </div>
            </div>
            {meanings.map((meaning) =>
              meaning.definitions.map((def, idx) => (
                <div className="mb-2">
                  <span className="text-gray-400 ml-3">{idx + 1}</span>{' '}
                  <span className="font-medium">
                    {def.definition.replace(/\.$/, '')}
                  </span>
                  {def.example ? <span className="italic">: {def.example}</span> : ''}
                </div>
              )),
            )}
          </div>
        ))
        .flat()}
    </div>
  );
};