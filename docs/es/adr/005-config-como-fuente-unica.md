# ADR-005 · `config/` como fuente única de parámetros y fuentes de datos

**Estado:** aceptada · 14-nov-2026

**Contexto:** los parámetros del modelo (Tobler, arena, rocas, umbrales de clima, límites) y las rutas de datos estaban repartidos entre el código C#, el JS y los scripts.

**Decisión:**
- `config/model-parameters.json` guarda los parámetros, cada uno con su fuente. Los umbrales del espacio de trabajo (pendiente máxima y fracción de duna grande) viven en ese mismo JSON: el motor C# y el filtro de ciencia del navegador los leen de ahí.
- `config/site.jezero-issole.json` guarda los puntos, las paradas, las capas de Mars Trek, las URL de descarga y las rutas de `data/`.
- El pipeline los lee directamente. La app los recibe copiados en `app/data/` por el export.

**Alternativas descartadas:**
- Constantes duplicadas en cada lenguaje.

**Consecuencias:**
- ✅ Un cambio se hace en un solo lugar, y la paridad (ADR-004) confirma que ambos motores lo aplican igual.
- ✅ El panel de supuestos de la app muestra las fuentes directamente desde la config.
