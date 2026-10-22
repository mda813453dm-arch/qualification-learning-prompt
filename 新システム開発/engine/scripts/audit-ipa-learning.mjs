/** 共有問題の実データを読み戻し、資格別・区分別の出題可能数を表示する（読み取り専用）。 */
import { CATALOG } from '../src/catalog.js';
import { officialLibrary } from '../src/official-library.js';
import { GcpStore } from '../src/gcp-store.js';

const store = new GcpStore({ bucket: 'qualification-learning-qlp-figures' });
for (const cat of [CATALOG.fe, CATALOG.ap]) {
  const library = await officialLibrary(store, cat, '0.8.2');
  console.log('IPA_LEARNING_READBACK', JSON.stringify({ qualification: cat.name,
    registeredSections: library.stored.length, questions: library.totalQuestions,
    stored: library.stored, supportedYears: library.supportedYears }));
}
