# Research Findings: Atlas Racing LLM Race Engineer Study

## Research Question

> **"Can Large Language Models effectively serve as AI Race Engineers when provided with structured real-time telemetry context?"**

### Sub-questions

- **SQ1:** What is the effect of LLM race engineering on race performance outcomes?
- **SQ2:** How does the LLM influence energy management and pit strategy decisions?
- **SQ3:** How do drivers perceive, trust, and interact with LLM-generated advice?
- **SQ4:** Does the order of exposure (LLM-first vs control-first) affect performance or learning transfer?

---

## Study Design

| Element | Detail |
| --- | --- |
| Game | EA Sports F1 25 (80% AI difficulty) |
| Race length | Phase-1: 100% distance; Phase-2: 50% distance |
| Weather | Dry (clear), all races |
| Team/Driver | Worst-performing team (Kick Sauber), consistent across all participants |
| LLM | Claude (Anthropic), accessed via API with structured telemetry prompts |
| Design | Within-subjects, counterbalanced (control-first vs LLM-first) |
| Participants | 5 total: P0 (researcher/pilot), P1-P4 (study participants) |

### Participant Structure

| Participant | Phase | Order | Races | Skill Level |
| --- | --- | --- | --- | --- |
| P0 | Phase-1 (pilot) | Control only (10 races) | R1-R10 | Researcher (skilled) |
| P1 | Phase-2 | Control (R1-R5) → LLM (R6-R10) | 10 | Skilled |
| P2 | Phase-2 | Control (R11-R15) → LLM (R16-R20) | 10 | Weaker |
| P3 | Phase-2 | LLM (R1-R5) → Control (R6-R10) | 10 | Skilled |
| P4 | Phase-2 | LLM (R11-R15) → Control (R16-R20) | 10 | Weaker |

**Total: 50 races, 902 laps, 1,415 LLM interactions, 22,550+ telemetry data points across 150 files**

### Dataset Breakdown

| Group | Races | Laps | LLM Interactions | Telemetry Rows | Files |
| --- | --- | --- | --- | --- | --- |
| P0 (Phase-1, pilot) | 10 | 290 | 361 | 282 | 30 |
| P1 (Phase-2) | 10 | 154 | 234 | 154 | 30 |
| P2 (Phase-2) | 10 | 152 | 255 | 151 | 30 |
| P3 (Phase-2) | 10 | 154 | 257 | 153 | 30 |
| P4 (Phase-2) | 10 | 152 | 308 | 152 | 30 |
| **Total** | **50** | **902** | **1,415** | **892** | **150** |

Phase-1 has roughly double the laps (290 vs ~153) because those were 100% distance races. Each telemetry row contains 25 data channels (lap time, sectors, position, gaps, tyre compound/wear, ERS state/mode, weather, etc.), yielding **22,300+ individual telemetry data points**. LLM call counts match exactly between summary files and interaction logs (1,415 = 1,415), confirming data consistency.

---

## SQ1: Effect on Race Performance

### Individual Results

| Participant | Skill | Condition | Avg Finish | Wins | Podiums | Points/Race |
| --- | --- | --- | --- | --- | --- | --- |
| P0 (pilot) | Skilled | Control only | 2.78* | 4/9 | 8/9 | 16.3 |
| P1 | Skilled | Control | 1.4 | 4/5 | 5/5 | 22.2 |
| P1 | Skilled | LLM | 1.6 | 3/5 | 5/5 | 22.2 |
| P2 | Weaker | Control | 9.4 | 0/5 | 0/5 | 3.2 |
| P2 | Weaker | LLM | **1.0** | 5/5 | 5/5 | **25.0** |
| P3 | Skilled | LLM | 1.4 | 4/5 | 5/5 | 23.0 |
| P3 | Skilled | Control | 3.25** | 0/4 | 4/4 | 15.0 |
| P4 | Weaker | LLM | 2.4 | 2/5 | 3/5 | 21.6 |
| P4 | Weaker | Control | 7.0 | 0/5 | 0/5 | 5.0 |

*excludes R2 DNF | **excludes R10 DNF

### Aggregated Comparison

| Metric | LLM (20 races) | Control (29 races, incl. P0) |
| --- | --- | --- |
| Avg finish position | **1.65** | **4.68** |
| Win rate | 70% (14/20) | 41% (12/29) |
| Podium rate | 90% (18/20) | 69% (20/29) |
| Points per race | 22.4 | 12.5 |

### The Skill Equalizer Effect

The LLM's impact scales inversely with driver skill — the weaker the driver, the greater the improvement:

| Participant Pair | Control Avg | LLM Avg | Position Improvement |
| --- | --- | --- | --- |
| P2 (weaker) | 9.4 | 1.0 | **+8.4 positions** |
| P4 (weaker) | 7.0 | 2.4 | **+4.6 positions** |
| P3 (skilled) | 3.25 | 1.4 | +1.85 positions |
| P1 (skilled) | 1.4 | 1.6 | -0.2 (ceiling effect) |

P1 represents a **ceiling effect**: already winning 4/5 control races, there was no room for LLM improvement. This is an expected outcome — a race engineer cannot improve a driver who is already finishing first. Notably, P1's LLM races still achieved 100% podium rate, and the notes confirm the LLM advice was correct even when it didn't change the outcome.

For weaker drivers, the LLM transformed mid-field finishes into race wins. P2 went from averaging P9.4 (zero podiums) to P1.0 (five consecutive wins). P4 went from P7.0 (zero podiums) to P2.4 (three podiums, two wins).

---

## SQ2: Energy Management and Pit Strategy

### ERS Management — The Primary Differentiator

The Energy Recovery System (ERS) emerged as the single most impactful area of LLM assistance. ERS requires track-specific, corner-by-corner decisions about when to harvest (recover) and deploy (use) electrical energy — a cognitive task humans struggle with in real-time while simultaneously racing.

#### Telemetry Evidence

The F1 game transmits actual battery state via UDP telemetry, providing objective, machine-recorded data that cannot be influenced by participant bias. The following data compares the same participants across conditions:

**P2 — Control R11 (Red Bull Ring) — Battery depleted, never recovered:**

```
Lap:  1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17
ERS: 33   8   3   1   0   0   0  10   1   0   0   0   0   0   0   0   0
Mode: OT  HL  OT  OT  OT  OT  OT  HV  OT  OT  OT  OT  OT  OT  OT  OT  OT
```

P2 held Overtake mode (maximum deployment) for nearly the entire race, draining the battery to 0% by lap 5 and never recovering. Participant note: *"No idea how to save ERS and no clue if I should stop early or late."*

**P2 — LLM R16 (Monza) — Active cycling, battery maintained:**

```
Lap:  1   2   3   4   5   6   7   8   9  10  11  12
ERS: 19  11  16  83 100  90  46  69  22  45  55  39
Mode: OT  OT  OT  HV  HV  OT  OT  HV  OT  OT  OT  HV
```

Under LLM guidance, P2 actively switched between Overtake and Harvest modes. Battery cycled between 11-100%, with strategic harvesting during safety car laps (4-5) to build a full charge. Participant note: *"Really helped me save a lot and use it in straights for max performance."*

**P4 — LLM R11 (Red Bull Ring) — Sustained high charge:**

```
Lap:  1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17
ERS: 54  27  10  15  30  79  71  74  77  82  44  31  96 100 100  92  85
Mode: OT  MD  MD  MD  HV  OT  OT  OT  HV  HV  OT  OT  HV  HV  HL  HL  HL
```

P4 with LLM guidance maintained battery above 70% for 10 of 17 laps, switching modes strategically. The LLM instructed specific corners for harvesting and deployment.

**P4 — Control R16 (Monza) — Erratic, mostly depleted:**

```
Lap:  1   2   3   4   5   6   7   8   9  10  11  12
ERS:  9   3   7  54   4   9   5   2  38   5  66  41
Mode: OT  OT  OT  HV  OT  HV  OT  OT  HV  OT  OT  OT
```

Without LLM guidance, P4's ERS management was erratic — battery below 10% for 6 of 12 laps, with occasional unintentional harvesting. Participant note: *"Kinda remember ERS saving tips lol"* — partial knowledge transfer from LLM races, but insufficient for consistent management.

**P2 — Control R13 (Spa) — Partial recovery only at favourite track:**

```
Lap:  1   2   3   4   5   6   7   8   9  10
ERS: 37   0   4   1   3   4   7  29  51  73
Mode: OT  OT  OT  OT  HV  OT  MD  MD  MD  MD
```

Even at Spa — the one track P2 described as their favourite (finished P5, best control result) — the battery hit 0% on lap 2 and only recovered after lap 7 when P2 switched to Medium mode. Even best-case control performance was inferior to any LLM-guided race.

**P2 — LLM R18 (Singapore) — Textbook cycling throughout:**

```
Lap:  1   2   3   4   5   6   7   8   9  10  11  12  13  14  15
ERS: 20  21  30  50  45  52  25  24  12   8  22  30  47  75  72
Mode: OT  HV  OT  HV  OT  OT  OT  OT  HV  OT  OT  OT  HV  OT  OT
```

Battery consistently cycled between 8-75%, never hitting 0%, with a clear build-up toward the end of the race (75% on final laps). The LLM managed deployment to ensure energy was available for crucial overtaking moments.

#### Why ERS is a key finding

1. **Objective measurement** — Battery state is recorded by the game's UDP telemetry, not self-reported
2. **Cannot be faked** — A participant deliberately performing poorly would still show their natural ERS pattern. Different ERS usage reflects different *knowledge*, not different effort
3. **Every participant mentioned it** — ERS appeared in notes across all 5 participants as either a benefit (LLM) or a struggle (control)
4. **Transfer effect** — P3 R9 control: *"Forgot the ERS techniques from the LLM races"*; P4 R16 control: *"Kinda remember ERS saving tips lol"* — participants retained partial ERS knowledge after LLM exposure

#### ERS Mode Legend

| Mode | Name | Abbreviation | Effect |
| --- | --- | --- | --- |
| 0 | Harvest / None | HV | No deployment, maximum energy recovery |
| 1 | Medium | MD | Balanced deployment and recovery |
| 2 | Hotlap | HL | High deployment, minimal recovery |
| 3 | Overtake | OT | Maximum deployment, no recovery |

### Pit Strategy

All Phase-2 races were 1-stop (except P1 R8 Monaco and P3 R8 Monaco with 2 mandatory stops). Pit timing was similar across conditions (~lap 8.7 control vs ~lap 9.1 LLM), but the LLM contributed in two distinct ways:

**1. Compound selection against the field:**

The LLM consistently recommended harder compounds than the AI field. P2 R20: *"Crazy pit call for hards instead of softs. Whole grid went for softs but somehow I managed to keep P1."* The harder compound provided longer stint life and fewer position-losing degradation moments.

**2. Opportunistic safety car stops:**

P2 R16: The LLM called an immediate pit stop under safety car on lap 4. The participant described: *"awesome call to make P1 possible...otherwise I would've missed the pit entry and might have lost a lot of positions."* Recognising and exploiting safety car windows requires rapid situational awareness that the LLM provided.

**3. Known limitation — "Box last lap" problem:**

The LLM occasionally recommended pitting on the final or near-final lap, which is strategically nonsensical. P3 R2: *"it asked Lap14, I mean the race ends on lap14."* P4 R14: *"LLM says box last lap, like what do you mean stop last lap??"* This is a systematic prompt/context issue — the LLM lacked a hard constraint against pitting when remaining laps couldn't justify a tyre change.

---

## SQ3: Driver Perception, Trust, and Interaction

### Trust Trajectory (followedRate)

The `followedRate` metric captures the percentage of LLM strategic recommendations the driver chose to follow during each race.

| Race | P1 | P2 | P3 | P4 |
| --- | --- | --- | --- | --- |
| LLM Race 1 | 82% | 73% | 86% | 88% |
| LLM Race 2 | 100% | 88% | 50% | 88% |
| LLM Race 3 | 63% | 67% | 87% | 80% |
| LLM Race 4 | 83% | 100% | 100% | 64% |
| LLM Race 5 | 75% | 100% | 72% | 88% |
| **Average** | **80.6%** | **85.6%** | **79.0%** | **81.6%** |

**P0 (pilot):** followedRate 0% across all 10 races — deliberate non-compliance for system evaluation. However, notes never described the LLM strategy as wrong; all self-identified errors were driving or ERS mistakes. This pilot validation established baseline trust before participant deployment.

### Trust Patterns

**1. Initial trust is moderate-to-high (72-88%).** No participant started at 100% — all exercised initial caution while evaluating the LLM's quality.

**2. Trust dips correlate with confusing advice, not wrong advice.** P3 R2 dropped to 50% because the LLM recommended pitting on the final lap. P4 R4 dropped to 64% because pit strategy kept changing. Neither dip was caused by bad outcomes — both were caused by unclear or unstable recommendations.

**3. Trust recovers after demonstrated competence.** P2's trajectory (73→88→67→100→100) shows a dip at R18 from confusing pit calls, then full commitment after the calls proved correct. By R19-R20, P2 followed 100% of recommendations.

**4. Terminal trust statements confirm qualitative acceptance:**
- P2 R20: *"Man I trust LLM a bit too much"*
- P4 R20: *"Enjoyed LLM part and missed it during controlled races"*
- P1 R8: *"Following LLM blindly now!"*

### Strategy Quality — Self-Reported

Participants rated the LLM's strategy quality in post-race notes:

| Participant | LLM Races Rated "Correct" | Control Self-Assessment |
| --- | --- | --- |
| P1 | 5/5 | 1 "partial", 4 "wrong" (referring to LLM output they didn't follow) |
| P2 | 5/5 | 5/5 "wrong" (genuinely didn't know the right strategy) |
| P3 | 5/5 | 5/5 "correct" (self-directed, skilled driver) |
| P4 | 5/5 | 5/5 "correct" (self-directed) |

Every LLM race was rated "correct" (20/20). The distinction between P1/P2 and P3/P4 control ratings reflects that skilled participants (P3) made reasonable decisions independently, while weaker participants (P2) recognised their own strategic deficiency.

### Driver Information-Seeking Behaviour

The number of driver-initiated questions per race serves as a proxy for strategic uncertainty:

| Participant | Avg Questions (LLM) | Avg Questions (Control) |
| --- | --- | --- |
| P0 | — | 20.2 |
| P1 | 12.8 | 9.4 |
| P2 | 9.6 | 17.0 |
| P3 | 9.4 | 15.6 |
| P4 | 14.6 | 19.2 |

P2, P3, and P4 asked **more** questions during control races — they were uncertain and seeking guidance they could not act on. This inverts the naive expectation: the LLM appears to **reduce** strategic uncertainty by providing clear directives, rather than adding informational overhead.

P1 is the exception — a skilled driver who asked more questions during LLM races, suggesting active engagement with the engineer (collaborative decision-making) rather than uncertainty.

**Limitation:** Driver questions are an indirect proxy and not a validated measure of cognitive load. A formal assessment would require instruments such as the NASA-TLX workload scale or physiological measurements, which were outside the scope of this exploratory study.

---

## SQ4: Order Effects and Learning Transfer

The counterbalanced design allows comparison of control-first (P1, P2) vs LLM-first (P3, P4) participants:

### Performance by Order

| | Control-First (P1, P2) | LLM-First (P3, P4) |
| --- | --- | --- |
| Control avg finish | 5.40 | 5.06 |
| LLM avg finish | 1.30 | 1.90 |

**Control-first participants performed slightly worse in control** (5.40 vs 5.06) — they had no prior LLM exposure to learn from.

**LLM-first participants performed slightly worse in LLM** (1.90 vs 1.30) — the LLM was their first experience, before building system familiarity.

### Evidence of Learning Transfer

LLM-first participants (P3, P4) showed signs of carrying knowledge from LLM races into their subsequent control races:

- **P3 R9 (control):** *"Forgot the ERS techniques from the LLM races"* — awareness of lost knowledge implies partial retention
- **P4 R16 (control):** *"Kinda remember ERS saving tips lol"* — explicit mention of retained LLM advice
- **P4 R20 (control):** *"Enjoyed LLM part and missed it during controlled races"* — perceived performance gap without LLM

P3's control avg (3.25) was notably better than P2's control avg (9.4) despite racing the same tracks — but P3 is also a more skilled driver, so the learning transfer effect cannot be fully isolated from baseline skill with this sample size.

### Trust by Order

| | Control-First First LLM Race | LLM-First First LLM Race |
| --- | --- | --- |
| P1 | 82% | P3: 86% |
| P2 | 73% | P4: 88% |

LLM-first participants started with slightly higher trust. One interpretation: participants with no prior exposure to the system approach the LLM with more openness. Control-first participants may develop scepticism from observing LLM advice during control races without acting on it.

---

## Data Integrity Verification

### ERS Telemetry as Objective Validation

The ERS battery data provides an objective check against deliberate sandbagging (participants intentionally performing worse in control). Key argument:

- A participant faking poor control results would still show their natural ERS management pattern — they would brake late or miss apexes, not fundamentally change how they deploy electrical energy
- The ERS patterns in control races show genuinely different *knowledge*, not different effort: holding Overtake mode constantly (draining to 0%) vs cycling modes per corner (maintaining 20-80%)
- This pattern is consistent across both weaker participants (P2, P4) and appears in the control races of all participants including the researcher (P0)

### Internal Consistency Checks

- P2's best control result (P5 at Spa) aligns with their note: *"It was my favourite track so strong performance"* — natural variance from track familiarity
- P1's control results (avg 1.4) being better than LLM results (avg 1.6) argues against any systemic bias toward inflating LLM outcomes
- P3's control races still produced podiums (P3, P3, P4, P3) — consistent with a skilled driver losing some strategic edge, not deliberately underperforming

---

## Limitations

1. **Small sample size (n=5, n=4 for within-subjects).** Sufficient for exploratory research but precludes meaningful inferential statistics. Results should be interpreted as indicative, not confirmatory.

2. **AI difficulty at 80%.** The AI opponents race at 80% of their maximum capability. Results may not generalise to higher difficulty settings where position gains from the back of the grid are harder to achieve.

3. **Worst team constraint.** All participants used the lowest-performing team (Kick Sauber), starting P15-P20. This creates large potential for position improvement that would be smaller with a competitive team starting P1-P5.

4. **Phase-1 vs Phase-2 conditions differ.** P0's pilot races used 100% distance with dynamic weather. Phase-2 used 50% distance with dry weather. P0 data is contextual, not directly comparable.

5. **Cognitive load not formally measured.** Driver questions serve as an indirect proxy. A validated instrument (e.g., NASA-TLX) was not used.

6. **Self-reported strategy quality.** The "correct/wrong/partial" ratings come from participant notes and are subjective.

7. **Single LLM model tested.** The study used Claude (Anthropic). Results may differ with other LLMs (GPT-4, Gemini, etc.), though the research question concerns LLM capability in general, not model-specific performance.

8. **Pit stop data required manual correction.** A phantom pit stop bug in the logging code required 30+ manual corrections using pen-and-paper records. All corrections are documented and traceable.

---

## Summary of Key Findings

| Finding | Evidence Strength | Detail |
| --- | --- | --- |
| LLM improves race performance | **Strong** (quantitative) | Avg finish 1.65 (LLM) vs 4.68 (control) across 49 races |
| Effect is largest for weaker drivers | **Strong** (quantitative) | P2: +8.4 positions, P4: +4.6 positions |
| ERS management is the primary mechanism | **Strong** (objective telemetry) | Battery cycling 20-100% (LLM) vs depleted at 0% (control) |
| Drivers develop trust over 5 races | **Moderate** (mixed methods) | followedRate avg 81.7%, with recovery after dips |
| LLM pit strategy is generally correct | **Moderate** (qualitative + quantitative) | 20/20 "correct" rating, but "box last lap" systematic error exists |
| Partial learning transfer occurs | **Suggestive** (qualitative) | P3/P4 notes reference retained ERS knowledge in control races |
| Skilled drivers show ceiling effect | **Moderate** (quantitative) | P1 control avg 1.4 ≈ LLM avg 1.6; no improvement when already winning |
