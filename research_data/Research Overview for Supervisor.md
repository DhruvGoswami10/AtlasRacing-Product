# Atlas Racing: Research Overview

*A plain-language summary of the project, its purpose, and its findings — written for readers who may not be familiar with motorsport or game telemetry.*

---

## What is this research about?

This research investigates whether a **Large Language Model (LLM)** — the same type of AI technology behind tools like ChatGPT and Claude — can serve as a real-time **race engineer** in a competitive racing environment. Specifically, we ask:

> **"Can an LLM effectively serve as an AI Race Engineer when provided with structured real-time telemetry context?"**

---

## Key Terms Explained

### What is a Race Engineer?

In professional motorsport (Formula 1, for example), every driver has a **race engineer** — a human expert who sits on the pit wall and communicates with the driver via radio throughout the race. The race engineer:

- Monitors live data from the car (speed, tyre wear, fuel, battery, gaps to other cars)
- Advises the driver on **when to make a pit stop** (come into the pits to change tyres)
- Recommends **which tyres** to switch to (soft tyres are fast but wear out quickly; hard tyres are slower but last longer)
- Guides **energy management** — when to save electrical energy and when to use it for overtaking
- Reacts to **race events** like safety cars, weather changes, and crashes

The race engineer does not drive the car — they provide strategic information so the driver can make better decisions. The driver always has the final say.

### What is Telemetry?

**Telemetry** is the real-time data stream from the car to the team. In a real F1 car, hundreds of sensors transmit data every second: engine temperature, tyre pressure, suspension load, GPS position, and more.

In our study, we use the video game **EA Sports F1 25**, which simulates this telemetry system. The game broadcasts data via **UDP (User Datagram Protocol)** — a standard networking method — at up to 60 times per second. This data includes:

- **Lap times** (how fast the driver is going)
- **Tyre compound and wear** (which tyres are on and how degraded they are)
- **ERS battery state** (how much electrical energy is stored — see below)
- **Position and gaps** (where the driver is relative to every other car)
- **Weather and track conditions**

Our system captures this telemetry, structures it into a readable format, and sends it to the LLM as context for each strategic decision.

### What is ERS?

The **Energy Recovery System (ERS)** is a hybrid battery system in modern F1 cars. When the driver brakes, kinetic energy is converted to electrical energy and stored in a battery. The driver can then deploy this stored energy for an extra speed boost — crucial for overtaking or defending position.

Managing ERS is complex because:
- You must decide **which corners** to harvest energy in (typically slow corners)
- You must decide **which straights** to deploy energy on (typically the longest ones)
- You need to balance short-term gains (use energy now to overtake) against long-term strategy (save energy for a later fight)
- The optimal strategy changes **every lap** based on tyre condition, gaps to other cars, and remaining race distance

In real F1, a team of engineers with computer models handles this. In a video game, the player must manage it alone — unless they have an AI race engineer.

### What is a Large Language Model (LLM)?

An LLM is an AI system trained on vast amounts of text data that can understand and generate natural language. ChatGPT (by OpenAI) and Claude (by Anthropic) are well-known examples. LLMs can:

- Read and understand structured data (like telemetry)
- Reason about complex situations
- Communicate advice in natural language
- Adapt their recommendations based on changing context

In this study, we use the LLM not as a chatbot, but as a **decision support system** — it receives race telemetry and provides strategic advice in real-time, mimicking the role of a human race engineer.

---

## Why does this matter?

### Academic Significance

No peer-reviewed research exists on using LLMs as race engineers. Related work has explored:

- Machine learning for pit strategy optimisation (Mercedes-AMG/Imperial College, 2025)
- Reinforcement learning for race decisions (TUM/BMW, 2020)
- AI coaching for driving improvement (UC San Diego/Toyota, 2024)

However, **none of these** combine an LLM with real-time telemetry for conversational strategic advice. This study is the first to investigate this specific intersection.

### Broader Relevance

The findings extend beyond racing games:

- **Human-AI collaboration:** How do humans develop trust in AI advice during high-pressure, real-time tasks?
- **LLM capabilities:** Can LLMs process structured numerical data (not just text) and provide contextually appropriate advice?
- **Skill equalisation:** Can AI assistance help less experienced individuals perform closer to expert level?
- **Knowledge transfer:** Do people retain skills learned from AI guidance after the AI is removed?

These questions are relevant to fields including aviation, medicine, military operations, and any domain where human operators receive AI-assisted decision support.

---

## What did we do?

### The System (Atlas Racing)

We built a web-based dashboard that:

1. **Captures** real-time telemetry from the F1 25 video game via UDP
2. **Structures** the data into a format the LLM can understand (current position, gaps, tyre state, ERS battery, weather, etc.)
3. **Sends** the structured data to the LLM (Claude by Anthropic) via API
4. **Displays** the LLM's strategic advice to the driver in real-time
5. **Logs** every interaction for research analysis (what the LLM said, what the driver did, and the race outcome)

The LLM provides three types of advice:
- **Pit strategy** — when to stop and which tyres to use
- **ERS management** — which corners to harvest and deploy energy
- **Tactical advice** — responses to safety cars, weather changes, and driver questions

### The Experiment

We conducted a **within-subjects study** with 5 participants:

- **Phase 1 (Pilot):** The researcher (P0) raced 10 races without following LLM advice, to validate that the system worked and the advice was reasonable
- **Phase 2 (Study):** 4 participants each raced 10 races — 5 with LLM assistance and 5 without

To control for **order effects** (the possibility that improvement comes from practice, not the LLM):
- P1 and P2 raced **without** the LLM first, then **with** it
- P3 and P4 raced **with** the LLM first, then **without** it

This **counterbalanced design** means that if performance improves simply from practice, we would see it equally in both groups — allowing us to separate practice effects from LLM effects.

All participants used the **worst-performing team** in the game and started from the back of the grid (positions 15-20), creating maximum room for improvement.

### What we measured

| Data Type | How Collected | What It Tells Us |
| --- | --- | --- |
| Race results (position, points) | Automatic from game | Did the LLM improve performance? |
| Lap telemetry (times, ERS, tyres) | Automatic via UDP (60Hz) | How did driving behaviour change? |
| LLM interactions (advice, responses) | Automatic logging | What did the LLM recommend? |
| followedRate | Automatic tracking | Did the driver follow the advice? |
| Participant notes | Written after each race | How did the driver feel about the advice? |

---

## What did we find?

### 1. The LLM dramatically improved performance

Across 20 LLM-assisted races, the average finishing position was **1.65** (nearly always winning or on the podium). Across 29 control races, the average was **4.68**.

The improvement was largest for **weaker drivers**:
- One participant went from averaging **9th place** (no podiums) to **1st place** (five consecutive wins)
- Another went from averaging **7th place** to **2nd place**

Skilled drivers showed little change because they were already winning — a **ceiling effect**.

### 2. Energy management was the key mechanism

Using objective telemetry data (battery percentage recorded by the game every lap), we found a stark difference:

- **Without LLM:** Drivers held maximum deployment mode, draining the battery to 0% within 5 laps and racing the remainder with no electrical boost
- **With LLM:** Drivers cycled between harvest and deploy modes, maintaining 20-80% battery throughout the race

This is not self-reported — it is machine-recorded data from the game itself, providing objective evidence that the LLM changed actual driving behaviour.

### 3. Drivers developed trust over time

Participants followed about **81%** of LLM recommendations on average. Trust dipped when advice was confusing (e.g., recommending a pit stop on the last lap) but recovered after the LLM proved correct. By the final LLM races, two participants followed 100% of recommendations.

Notable participant quotes:
- *"Man I trust LLM a bit too much"*
- *"Following LLM blindly now!"*
- *"Enjoyed LLM part and missed it during controlled races"*

### 4. Some knowledge transferred after LLM removal

Participants who used the LLM first and then raced without it showed signs of retaining some learned techniques:
- *"Forgot the ERS techniques from the LLM races"* (awareness of lost knowledge implies partial retention)
- *"Kinda remember ERS saving tips lol"*

---

## How is the data structured?

The dataset contains **50 races, 902 laps, and 1,415 LLM interactions** across 5 participants, organised as:

```
research_data/
├── Phase-1/          (P0: 10 pilot races)
│   ├── Race-1/
│   │   ├── ..._lap_telemetry.csv       (one row per lap)
│   │   ├── ..._llm_interactions.json   (every LLM call and response)
│   │   └── ..._race_summary.json       (aggregated race metrics)
│   └── Race-2/ ... Race-10/
│
└── Phase-2/          (P1-P4: 40 study races)
    ├── P1/ (Race-1 to Race-10)
    ├── P2/ (Race-1 to Race-10)
    ├── P3/ (Race-1 to Race-10)
    └── P4/ (Race-1 to Race-10)
```

### Per-Participant Breakdown

| Participant | Races | Laps | LLM Interactions | Telemetry Rows | Files |
| --- | --- | --- | --- | --- | --- |
| P0 (pilot) | 10 | 290 | 361 | 282 | 30 |
| P1 | 10 | 154 | 234 | 154 | 30 |
| P2 | 10 | 152 | 255 | 151 | 30 |
| P3 | 10 | 154 | 257 | 153 | 30 |
| P4 | 10 | 152 | 308 | 152 | 30 |
| **Total** | **50** | **902** | **1,415** | **892** | **150** |

P0's higher lap count (290 vs ~153) reflects 100% race distance in Phase-1, compared to 50% distance in Phase-2. Each telemetry row records 25 data channels per lap, yielding **22,300+ individual data points**.

Each race produces three files:
- **Lap telemetry CSV:** Per-lap performance data (lap times, sector times, tyre wear, ERS state, position, gaps)
- **LLM interactions JSON:** Every LLM call with full context, the AI's response, latency, and whether the driver followed the advice
- **Race summary JSON:** Aggregated metrics including finish position, pit stops, follow rate, and participant notes

---

## Limitations

- **Small sample (n=5):** This is an exploratory study. The results are indicative, not statistically generalisable.
- **Single game, single difficulty:** All races were at 80% AI difficulty in F1 25. Results may differ at higher difficulties or in other racing simulations.
- **Single LLM:** Only Claude (Anthropic) was tested. Other LLMs may perform differently.
- **No formal cognitive load measurement:** We used driver questions as a proxy, not a validated instrument like NASA-TLX.
- **Controlled environment:** Video game racing, while realistic, is not real motorsport. The findings suggest potential but do not directly prove real-world applicability.

---

## What makes this publishable?

| Criterion | Assessment |
| --- | --- |
| **Novelty** | First academic study of LLMs as race engineers — confirmed gap in literature |
| **Methodology** | Within-subjects counterbalanced design with both quantitative and qualitative data |
| **Objective evidence** | ERS telemetry provides machine-recorded behavioural data, not just self-reports |
| **Rich dataset** | 50 races, 902 laps, 1,415 LLM interactions, 22,550+ telemetry data points, participant notes |
| **Broader implications** | Findings speak to human-AI trust, skill equalisation, and real-time AI decision support |

Suitable venues: CHI Late-Breaking Work, CHI PLAY, Foundations of Digital Games (FDG), Entertainment Computing journal.

---

## One-Paragraph Summary

This study is the first to investigate whether a Large Language Model can serve as a real-time AI race engineer in a competitive racing environment. Using EA Sports F1 25 and live telemetry data, we built a system that feeds structured race data to an LLM (Claude), which responds with pit strategy, energy management, and tactical advice. In a counterbalanced within-subjects study with 5 participants across 50 races (902 laps, 1,415 LLM interactions), we found that LLM assistance improved average finishing position from 4.68 to 1.65, with the largest gains for less skilled drivers (one participant improved from 9th to 1st place average). Objective telemetry data confirmed that the primary mechanism was improved energy management: without the LLM, drivers depleted their battery within 5 laps, while LLM-guided drivers maintained 20-80% charge throughout races. Drivers developed trust in the system over 5 races (average 81% follow rate) and showed partial retention of learned techniques after LLM removal. The findings demonstrate that LLMs can provide contextually appropriate real-time strategic advice when given structured telemetry data, with implications for human-AI collaboration in time-critical decision-making domains.
