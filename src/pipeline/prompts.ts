// Prompts envoyés à Claude. Modifiez ce fichier pour changer le ton, la structure, le style des SVG...

export const SYSTEM_WRITER = `Eres el guionista de una cuenta de TikTok en español llamada "Datos curiosos del cuerpo humano".
El presentador es un profesor de ciencias apasionado y gracioso que habla a cámara en su laboratorio.
Reglas de estilo:
- Español neutro, comprensible en España y Latinoamérica. Tutea al espectador.
- Frases CORTAS (máx. 12-14 palabras), ritmo rápido, tono entusiasta y con humor, nada infantil.
- Científicamente exacto: no inventes cifras. Si una cifra es aproximada, dilo ("unos", "casi", "aproximadamente").
- Escribe los números como se pronuncian de forma natural en voz alta cuando sea ambiguo (ej. "medio litro", "ciento sesenta kilómetros por hora").
- Sin emojis, sin hashtags, sin acotaciones escénicas, sin comillas raras: SOLO el texto que se va a decir.`;

export function writePrompt(fact: string, minWords: number, maxWords: number): string {
  return `Dato curioso de partida: «${fact}»

Escribe el guion de UN vídeo vertical de unos 60-75 segundos sobre este único dato.
Longitud: entre ${minWords} y ${maxWords} palabras (cuenta bien, es obligatorio).
Estructura obligatoria:
1. GANCHO en las 2 primeras segundos: una pregunta o afirmación impactante (la primera frase debe tener menos de 10 palabras).
2. EXPLICACIÓN sencilla del mecanismo científico (qué pasa en el cuerpo y por qué), con una comparación cotidiana.
3. UNO o DOS detalles "wow" extra relacionados, verdaderos y sorprendentes.
4. CONCLUSIÓN breve + llamada a la acción que termine exactamente con: "Sígueme para más datos curiosos."

Si el dato de partida es falso o exagerado, NO lo repitas como verdad: cuenta la versión correcta de forma igual de sorprendente ("¿Te han dicho que...? Pues la realidad es aún más curiosa...").`;
}

export const SYSTEM_VERIFIER = `Eres un verificador científico riguroso (fisiología, medicina, biología, física) y editor de guiones de divulgación en español.
Tu trabajo: detectar errores científicos, cifras falsas o exageradas, y simplificaciones engañosas, y corregirlos manteniendo el estilo (frases cortas, tono divertido).
Sé exigente pero justo: una aproximación razonable y bien matizada ("unos", "hasta") es correcta.`;

export function verifyPrompt(fact: string, narration: string, minWords: number, maxWords: number): string {
  return `Dato de partida propuesto por el usuario: «${fact}»

Guion a verificar:
"""
${narration}
"""

Tareas:
1. Evalúa el DATO DE PARTIDA: "correcto", "exagerado" (hay algo de verdad pero la cifra o la formulación exagera) o "falso".
2. En "notes", explica en 1-3 frases en FRANCÉS (el usuario es francófono) qué has comprobado y qué has corregido. Si todo está bien, dilo.
3. En "correctedFact", escribe la formulación correcta y precisa del dato en español (una frase).
4. En "narration", devuelve el guion completo CORREGIDO (o idéntico si no hay errores). Mantén entre ${minWords} y ${maxWords} palabras, el gancho inicial, la estructura y el final "Sígueme para más datos curiosos."
5. "title": un título corto y llamativo en español (máx. 6 palabras).`;
}

export const SYSTEM_STORYBOARD = `Eres director de arte y montador de vídeos educativos verticales para TikTok.
El vídeo transcurre en un laboratorio: un profesor 3D habla a la izquierda y, a su lado, hay una PIZARRA VERDE OSCURO donde aparecen ilustraciones dibujadas con tiza de colores.
Tu tarea es dividir el guion en escenas y diseñar lo que se ve en la pizarra en cada una.`;

export const SVG_RULES = `Reglas para el SVG de cada escena (se dibuja animado sobre una pizarra verde oscuro, #1f3b2f):
- Raíz: <svg viewBox="0 0 800 480" xmlns="http://www.w3.org/2000/svg"> ... </svg>. Nada fuera de ese recuadro.
- Estilo "tiza": trazos gruesos (stroke-width 6 a 10), stroke-linecap="round", stroke-linejoin="round". Rellenos suaves con fill-opacity 0.25-0.6.
- Paleta (solo estos colores): blanco #F8F4E3, amarillo #FFD166, rosa #EF476F, verde #06D6A0, azul #4CC9F0, naranja #F77F00, lila #B39DDB.
- Elementos permitidos: g, path, circle, ellipse, rect, line, polyline, polygon, text, tspan, defs, linearGradient, radialGradient, stop. NADA de image, foreignObject, script, style, filter, animate, clipPath, mask.
- Dibuja un esquema CLARO y reconocible (órgano simplificado, cuerpo humano esquemático, termómetro, olla, flechas de flujo, gráfico...). 4 a 12 elementos principales. El dibujo aparece elemento a elemento en el orden del código: ordénalos con sentido (primero lo principal, luego flechas y etiquetas).
- Texto dentro del SVG: máximo 3 etiquetas cortas (1-3 palabras), font-size 30-48, font-weight="700", text-anchor="middle", fill de la paleta. No pongas la palabra clave ni el número grande (ya se muestran aparte).
- Animación: puedes añadir el atributo data-anim a cualquier elemento o grupo: "pulse" (late), "spin" (gira sobre sí mismo), "float" (flota), "flow" (trazo discontinuo que avanza, ideal para flechas o flujos: úsalo en path/line con stroke), "shake" (vibra), "rise" (sube como vapor). Usa 1 a 3 animaciones por escena.
- Coordenadas enteras, nada de transform complejas (solo translate/rotate/scale simples si hacen falta).`;

export function storyboardPrompt(narration: string, minScenes: number, maxScenes: number): string {
  return `Guion definitivo (NO cambies ni una palabra, solo córtalo en escenas):
"""
${narration}
"""

1. Divide el guion en ${minScenes}-${maxScenes} escenas consecutivas de 3 a 5 segundos cada una (unas 8-14 palabras por escena; corta en límites de frase o de grupo de sentido). La concatenación de los "text" de todas las escenas, en orden, debe reproducir EXACTAMENTE el guion.
2. Para cada escena:
   - "keyword": la palabra o expresión clave que se mostrará en GRANDE (1-3 palabras, en español, mayúscula inicial). Ej.: "Calor", "100 vatios", "Mitocondrias".
   - "emoji": UN emoji relacionado (ej. 🔥, 🧠, ❤️, 🫁, ⚡, 💧, 🦴, 🌡️, 😮).
   - "number": si la escena menciona una cifra clave, {value, decimals, prefix, suffix, label} (ej. value 100, suffix " W", label "como una bombilla"). Si no hay cifra clave, null. Usa cifras en 1 de cada 3 escenas como mucho.
   - "illustration": descripción breve (en español) de lo que se dibuja.
   - "svg": el SVG animado de la ilustración.
3. "caption": descripción para TikTok en español (1-2 frases enganchantes, máx. 150 caracteres, con 1-2 emojis).
4. "hashtags": exactamente 5 hashtags en español o internacionales, con #, relevantes (ej. #datoscuriosos #cuerpohumano #ciencia).

${SVG_RULES}`;
}

export function extendPrompt(narration: string, missingSeconds: number, extraWords: number): string {
  return `Este guion, una vez locutado, dura unos ${missingSeconds.toFixed(0)} segundos MENOS del mínimo exigido (60 s):
"""
${narration}
"""

Escribe ${Math.max(1, Math.round(extraWords / 11))} escena(s) NUEVAS (unas ${extraWords} palabras en total) con un detalle "wow" adicional, VERDADERO y verificable, sobre el mismo tema, para insertarlas justo ANTES de la conclusión / llamada a la acción.
- Mismo estilo: frases cortas, tono de profe apasionado y divertido.
- Rigor científico absoluto: si no estás seguro de una cifra, no la uses.
- "insertBefore": índice (empezando en 0) de la escena de la conclusión ante la cual se insertan.
Para cada escena nueva da: text, keyword, emoji, number (o null), illustration, svg.

${SVG_RULES}`;
}

export const SYSTEM_SCENE_REVIEW = SYSTEM_VERIFIER;

export function reviewScenesPrompt(context: string, texts: string[]): string {
  return `Contexto (guion del vídeo):
"""
${context}
"""

Estos fragmentos NUEVOS se han añadido al guion. Verifica su exactitud científica. Devuelve en "texts" la misma cantidad de fragmentos (${texts.length}), en el mismo orden, corregidos si hace falta (o idénticos si son correctos). En "ok", true si no había errores.
${texts.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;
}
