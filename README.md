# Sirena City

Un juego de crimen en mundo abierto, visto desde arriba, que corre entero
en el navegador. Sin instalación, sin assets externos: cada coche, cada
edificio y cada sonido se genera con código.

## La historia

Sirena es un puerto de neón y salitre. **Marisol Vega** mueve paquetes por
los muelles y necesita un conductor que no haga preguntas. Su cadena de
encargos —un paquete para el farero, un Coral GT que "es suyo, digan lo que
digan los papeles" y una salida limpia de la ciudad— abre el juego; después,
el puerto sigue generando trabajos de mensajero y la ciudad queda libre
para explorar, robar y huir.

## Qué hay en la ciudad

- Una retícula de 6×5 manzanas con avenidas señalizadas, aceras, parques,
  aparcamientos, tiendas con nombre propio y ventanas encendidas al caer
  la tarde.
- El puerto: paseo marítimo con palmeras, tres muelles y un faro cuya luz
  barre el agua.
- Tráfico con carril derecho que frena, duda en los cruces y entra en
  pánico cuando suenan disparos; peatones que pasean y huyen del peligro.
- Nivel de búsqueda de 0 a 5 estrellas: la patrulla aparece según la
  presión, persigue, embiste y detiene si te quedas quieto. Perder el
  rastro apaga la búsqueda poco a poco.
- Coches robables (incluido arrancar al conductor de su asiento), deriva
  con freno de mano, daños, humo, fuego y explosiones en cadena.
- Combate a pie con puntería de ratón, trazadoras y recarga.
- HUD completo: minimapa con tráfico, patrullas y objetivo; estrellas;
  salud; dinero; estado del coche o del arma; y guardado en el navegador.

## Controles

| Tecla | Acción |
| --- | --- |
| W A S D / flechas | Moverse a pie · conducir |
| Mayús | Correr a pie |
| E | Hablar, subir a un coche, robarlo, salir |
| Espacio | Freno de mano |
| Ratón | Apuntar |
| Clic izquierdo | Disparar |
| R | Recargar |
| P / Esc | Pausa |

## Cómo se juega en local

```sh
node serve.ts
# abre http://localhost:8080
```

`serve.ts` sirve la carpeta `game/` tal cual; no hay paso de compilación.

## Cómo se entrega

`main.ts` (Node 22, solo biblioteca estándar) copia `game/` y
`screenshots/` a la carpeta de salida y escribe el `dossier.json` con la
librería vendida en `vendor/makefun-game.ts`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Entrada para el bounty **Make GTA 6** de make.fun:
https://make.fun/bounty/gta6-01

## Estructura del código

Todo el juego vive en `game/src/`, un archivo por trabajo:

- `city.js` — genera la ciudad: retícula, edificios, puerto, zonas.
- `rng.js` — aleatoriedad con semilla, para que la ciudad sea siempre la misma.
- `entities.js` — coches y peatones, con la física arcade compartida.
- `ai.js` — tráfico por carriles, peatones y persecución policial.
- `missions.js` — la cadena de Marisol y los encargos de mensajero.
- `game.js` — reglas: búsqueda, robo, combate, detenciones, guardado.
- `render.js` — el mundo al atardecer, el HUD y las pantallas.
- `audio.js` — sonido sintetizado con WebAudio: motor, sirena, disparos, bajo.
- `input.js` — teclado y ratón.
- `shots.js` — las escenas preparadas para las capturas (`?shot=…`).
- `main.js` — arranque, reloj y flujo de pantallas.
