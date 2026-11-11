#!/usr/bin/env python3
"""Voix de TEST hors-ligne (espeak-ng) avec horodatage mot par mot.

Sert uniquement à tester le pipeline sans clé ElevenLabs (la voix est robotique).
Usage : python3 espeak_tts.py texte.txt sortie.wav sortie_mots.json [voix] [vitesse]
Nécessite : apt install espeak-ng   (bibliothèque libespeak-ng.so.1)
"""
import ctypes, ctypes.util, json, sys, wave, array

text_path, wav_path, json_path = sys.argv[1:4]
voice = sys.argv[4] if len(sys.argv) > 4 else "es"
rate = int(sys.argv[5]) if len(sys.argv) > 5 else 165
text = open(text_path, encoding="utf-8").read().strip()

name = ctypes.util.find_library("espeak-ng") or "libespeak-ng.so.1"
lib = ctypes.cdll.LoadLibrary(name)

class Id(ctypes.Union):
    _fields_ = [("number", ctypes.c_int), ("name", ctypes.c_char_p), ("string", ctypes.c_char * 8)]

class Event(ctypes.Structure):
    _fields_ = [("type", ctypes.c_int), ("unique_identifier", ctypes.c_uint), ("text_position", ctypes.c_int),
                ("length", ctypes.c_int), ("audio_position", ctypes.c_int), ("sample", ctypes.c_int),
                ("user_data", ctypes.c_void_p), ("id", Id)]

CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.POINTER(Event))
samples = array.array("h")
events = []

def cb(wav, n, ev):
    if wav and n > 0:
        samples.extend(wav[:n])
    i = 0
    while ev[i].type != 0:
        e = ev[i]
        if e.type == 1:  # WORD
            events.append((e.text_position, e.length, e.sample))
        i += 1
    return 0

cbf = CB(cb)
sr = lib.espeak_Initialize(2, 500, None, 0)  # AUDIO_OUTPUT_SYNCHRONOUS
if sr <= 0:
    sys.exit("espeak_Initialize a échoué")
lib.espeak_SetSynthCallback(cbf)
lib.espeak_SetVoiceByName(voice.encode())
lib.espeak_SetParameter(1, rate, 0)  # espeakRATE
lib.espeak_SetParameter(6, 0, 0)  # espeakPUNCTUATION none
data = text.encode("utf-8")
lib.espeak_Synth(ctypes.c_char_p(data), len(data) + 1, 0, 1, 0, 1, None, None)  # POS_CHARACTER, espeakCHARS_UTF8
lib.espeak_Synchronize()

with wave.open(wav_path, "w") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes(samples.tobytes())

total = len(samples)
# énergie par trame de 10 ms pour trouver la fin réelle de chaque mot
hop = sr // 100
energy = []
for k in range(0, total, hop):
    seg = samples[k:k + hop]
    energy.append(sum(abs(x) for x in seg) / max(1, len(seg)))
thr = max(150.0, sorted(energy)[int(len(energy) * 0.9)] * 0.06) if energy else 150.0

chars = list(text)
words = []
for i, (pos, length, smp) in enumerate(events):
    start = smp / sr
    nxt = events[i + 1][2] if i + 1 < len(events) else total
    f0, f1 = smp // hop, max(smp // hop + 1, nxt // hop)
    last = f0
    for f in range(f0, min(f1, len(energy))):
        if energy[f] > thr:
            last = f
    end = min(nxt / sr, (last + 1) / 100 + 0.03)
    word = "".join(chars[pos - 1: pos - 1 + length]) if pos > 0 else ""
    words.append({"text": word, "start": round(start, 3), "end": round(max(end, start + 0.08), 3)})

json.dump({"sampleRate": sr, "duration": total / sr, "words": words}, open(json_path, "w"), ensure_ascii=False)
print(f"ok {total / sr:.2f}s {len(words)} mots")
