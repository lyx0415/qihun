"""Render the three original, looping Qihun scores as stereo Vorbis assets."""

from pathlib import Path

import numpy as np
import soundfile as sf


RATE = 24_000
OUT = Path(__file__).resolve().parents[1] / "public" / "music"
TAU = 2 * np.pi


def frequency(note):
    return 440 * 2 ** ((note - 69) / 12)


def pluck(note, duration, voice):
    t = np.arange(int(RATE * duration)) / RATE
    f = frequency(note)
    if voice == "bell":
        body = sum(gain * np.sin(TAU * f * ratio * t) * np.exp(-t / decay)
                   for ratio, gain, decay in [(1, .7, .38), (2.01, .23, .26), (3.13, .13, .12), (4.28, .06, .06)])
    elif voice == "bass":
        body = (np.sin(TAU * f * t) + .27 * np.sin(TAU * 2 * f * t) +
                .10 * np.sin(TAU * 3 * f * t)) * np.exp(-t * 7)
    else:
        phase = TAU * f * t + .03 * np.sin(TAU * 5 * t)
        body = sum(np.sin(h * phase) * (1 / h) * np.exp(-t * (3 + h * 2))
                   for h in (1, 2, 3, 4, 6))
    return body * np.minimum(1, t * 115) * np.minimum(1, (duration - t) * 24)


def pad(note, duration):
    t = np.arange(int(RATE * duration)) / RATE
    f = frequency(note)
    wave = np.sin(TAU * f * t) + .4 * np.sin(TAU * 1.003 * f * t) + .12 * np.sin(TAU * 2 * f * t)
    return wave * np.minimum(1, t * 4) * np.minimum(1, (duration - t) * 3) * .65


def drum(kind, random):
    lengths = {"deep": .43, "rim": .19, "hat": .13}
    t = np.arange(int(RATE * lengths[kind])) / RATE
    raw = random.uniform(-1, 1, len(t))
    if kind == "deep":
        wave = np.sin(TAU * (46 * t + 42 * (1 - np.exp(-t * 20)) / 20)) * np.exp(-t * 11)
        wave += .14 * raw * np.exp(-t * 65)
    elif kind == "rim":
        wave = (.5 * np.sin(TAU * 412 * t) + .35 * np.sin(TAU * 733 * t) + raw * .69) * np.exp(-t * 39)
    else:
        wave = np.diff(raw, prepend=0) * np.exp(-t * 47) * .45
    return wave * np.minimum(1, t * 500)


def render(name, bpm, chords, lead):
    beat = 60 / bpm
    bars = len(chords)
    out = np.zeros((round(bars * 4 * beat * RATE), 2))
    rng = np.random.default_rng(bpm)

    def add(at, data, gain, pan=0):
        time = round(at * beat * RATE)
        samples = (np.arange(len(data)) + time) % len(out)
        out[samples] += data[:, None] * gain * np.array([np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)])

    for bar, (root, chord) in enumerate(chords):
        begin = bar * 4
        for i, note in enumerate(chord):
            add(begin, pad(note - 12, beat * 4.12), .033 if name == "lounge" else .047, (i - 1) * .43)
        for j, event in enumerate(lead[bar]):
            when, note = event
            add(begin + when, pluck(note, .86 if name == "lounge" else .57, "bell" if name == "lounge" else "string"),
                (.18 if name == "lounge" else .24) * (1 - (j % 3) * .08), -.19 if j % 2 else .14)
        if name == "lounge":
            for index, interval in enumerate((0, 2.5)):
                add(begin + interval, pluck(root, .78, "bass"), .105 - index * .018)
            for index, interval in enumerate((.75, 1.5, 3.0, 3.5)):
                add(begin + interval, pluck(chord[index % 3], .55, "string"), .067, -.34 if index % 2 else .30)
            if bar % 2 == 0:
                add(begin + 2.25, drum("rim", rng), .042, .31)
        elif name == "duel":
            for when in (0, 1.5, 2.5, 3.25):
                add(begin + when, drum("deep", rng), .28 if when == 0 else .15)
                add(begin + when, pluck(root + (7 if when == 3.25 else 0), .39, "bass"), .15)
            for when in (1, 3, 3.75):
                add(begin + when, drum("rim", rng), .13 if when == 3 else .091, .20)
            for j in range(8):
                add(begin + j * .5, pluck(chord[(j + bar) % 3], .24, "string"), .09 - (j % 2) * .02, -.28 + (j % 2) * .56)
        else:
            for when, interval in ((0, 0), (.75, 7), (1.5, 0), (2.25, 12), (3.25, 7)):
                add(begin + when, pluck(root + interval, .30, "bass"), .20 if when == 0 else .14, -.1)
            for when in (0, 2, 3.25):
                add(begin + when, drum("deep", rng), .21)
            for when in (1, 2.75):
                add(begin + when, drum("rim", rng), .11, .28)
            for j in range(8):
                add(begin + j * .5 + .035 * (j % 2), drum("hat", rng), .065 if j % 2 else .035, -.35)
            for when in (.5, 1.75, 3.5):
                for j, note in enumerate(chord):
                    add(begin + when + .025 * j, pluck(note, .32, "string"), .07, -.36 + .32 * j)
    dry = out.copy()
    for delay, gain in ((.067, .15), (.15, .10), (.234, .055)):
        out += np.roll(dry[:, ::-1], round(delay * RATE), axis=0) * gain
    out = np.tanh(out * 1.4)
    out *= .79 / np.max(np.abs(out))
    with sf.SoundFile(OUT / f"{name}.ogg", "w", RATE, 2, format="OGG", subtype="VORBIS") as encoded:
        for start in range(0, len(out), 4096):
            encoded.write(out[start:start + 4096].astype(np.float32))
    print(f"{name}: {len(out) / RATE:.2f}s, {bpm} BPM")


LOUNGE_CHORDS = [(48, (60, 64, 67)), (45, (60, 64, 69)), (41, (60, 65, 69)), (43, (62, 67, 71)),
                 (48, (60, 64, 67)), (45, (60, 64, 69)), (41, (60, 65, 69)), (43, (62, 67, 71))]
LOUNGE_LEAD = [
    [(0, 67), (1, 69), (2.5, 72), (3.5, 74)], [(0, 76), (1.75, 72), (2.5, 69), (3.5, 67)],
    [(0, 69), (1, 72), (2.5, 76), (3.25, 74)], [(0, 72), (1.5, 69), (2.75, 67)],
    [(0, 72), (.75, 74), (2, 76), (3, 79)], [(0, 81), (1.5, 76), (2.5, 74), (3.5, 72)],
    [(0, 69), (1, 72), (2, 74), (3, 76)], [(0, 74), (1.5, 72), (3, 67)],
]
DUEL_CHORDS = [(38, (62, 65, 69)), (34, (58, 62, 65)), (36, (60, 64, 67)), (33, (57, 61, 64)),
               (38, (62, 65, 69)), (43, (67, 70, 74)), (34, (58, 62, 65)), (33, (57, 61, 64))]
DUEL_LEAD = [
    [(0, 74), (1.5, 77), (2.5, 76), (3.25, 74)], [(0, 70), (1, 74), (2.5, 77), (3.5, 79)],
    [(0, 81), (.75, 79), (2, 76), (3, 74)], [(0, 73), (1.5, 76), (2.5, 69), (3.5, 73)],
    [(0, 74), (.75, 77), (1.75, 81), (2.5, 84), (3.25, 81)], [(0, 82), (1, 79), (2, 77), (3.5, 74)],
    [(0, 77), (.75, 79), (1.75, 81), (3, 77)], [(0, 76), (1.5, 73), (2.5, 69), (3.5, 73)],
]
CARDS_CHORDS = [(43, (66, 70, 74)), (46, (65, 69, 74)), (48, (67, 70, 75)), (50, (66, 69, 72)),
                (43, (66, 70, 74)), (46, (65, 69, 74)), (48, (67, 70, 75)), (50, (66, 69, 72))]
CARDS_LEAD = [
    [(.25, 74), (1, 77), (1.75, 79), (2.5, 77), (3.25, 74)], [(.5, 70), (1.25, 74), (2.0, 77), (3.5, 74)],
    [(0, 75), (.75, 79), (1.5, 82), (2.5, 79), (3.5, 77)], [(0, 76), (.5, 74), (1.75, 69), (3.25, 72)],
    [(.25, 74), (1.25, 77), (2, 79), (2.75, 82), (3.5, 84)], [(.25, 82), (1, 77), (2.5, 74), (3.25, 77)],
    [(0, 79), (.75, 82), (1.5, 84), (2.5, 82), (3.25, 79)], [(0, 77), (.75, 76), (1.75, 74), (3, 72)],
]

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    render("lounge", 88, LOUNGE_CHORDS, LOUNGE_LEAD)
    render("duel", 116, DUEL_CHORDS, DUEL_LEAD)
    render("cards", 122, CARDS_CHORDS, CARDS_LEAD)
