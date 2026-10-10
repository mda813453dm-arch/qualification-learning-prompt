# Reference state-model checks (candidate v20 patch; NOT live AI execution)

PASS one practical miss doesn't reinforce -> B09 (expected B09)
PASS two same-item practical misses reinforce -> B11 (expected B11)
PASS a correct practical resets the streak -> B09 (expected B09)
PASS other-item miss excluded -> B09 (expected B09)
PASS other-item events don't cancel A's streak -> B11 (expected B11)
PASS held practical is not valid -> B11 (expected B11)
PASS first reinforcement miss leads to B11 -> B11 (expected B11)
PASS second reinforcement miss leads to B11 -> B11 (expected B11)
PASS third reinforcement miss shows U21 -> U21 (expected U21)
PASS fourth reinforcement miss still shows U21 -> U21 (expected U21)
PASS reinforcement success resumes parent -> B09 (expected B09)
PASS reinforcement success resumes review queue -> B16 (expected B16)
PASS held reinforcement ignored -> U21 (expected U21)
PASS ordinary confirmation miss no practical impact -> B11 (expected B11)
PASS reinforcement miss doesn't add practical miss -> B11 (expected B11)
PASS other-item reinforcement does not change A -> B11 (expected B11)
PASS reinforcement correction valid success returns -> B09 (expected B09)
PASS completed confirmation returns to practical -> B08 (expected B08)
PASS failed confirmation returns to confirmation -> B11 (expected B11)
PASS special graded practical is not treated as valid -> NO_GRADE (expected NO_GRADE)
PASS pending practical is not graded -> NO_GRADE (expected NO_GRADE)
PASS invalid practical is not graded -> NO_GRADE (expected NO_GRADE)

Model examples: 22/22 passed. Exhaustive sequences (6 event classes, length 5): 7776; counter invariant failures: 0.

These tests run a separate deterministic reference model, not the actual ChatGPT conversation engine. They do not validate real PDF downloads, legal sources, formatting behavior, or the model's adherence to the prompt. v19's unconditional B11 branch is known to contradict the U21 reference case; v20 patch is intended to fix this.
