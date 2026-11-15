# ADR-013 · Tres vetos y rutas alternativas con el tiempo recalculado

**Estado:** aceptada · 15-nov-2026

**Contexto:** Quien use el planificador puede no conocer Marte. Tiene que ver por qué entran tres grupos de datos y cómo eso decide salir o quedarse. Una suma con pesos dejaría que la ciencia compensara una falla de seguridad. Tampoco hay un enlace en vivo con la nave: la condición actual es la medición que carga la tripulación.

**Decisión:**

1. Tres vetos, sin peso entre ellos.
   - Terreno (HiRISE: pendiente, rocas, arena): ¿puedo caminar?
   - Clima (MEDA: temperatura y viento; Mastcam-Z: polvo): ¿aguantan el traje y la vista?
   - Radiación (Curiosity RAD y la alerta de partículas solares): ¿cabe la dosis de este tiempo afuera?
2. La ciencia no es un cuarto voto ni un peso. Solo ordena los planes que ya pasaron los cinco filtros. El tiempo es el presupuesto de la caminata, no un puntaje.
3. Al cambiar el escenario, el sol o una alerta se vuelven a evaluar todos los planes y todas las horas. Si un filtro saca la ruta larga, la explicación nombra la otra —más corta o más larga— con la duración que el filtro ya calculó. Si el clima o la radiación sacan una hora, la salida se mueve y el tiempo se muestra de nuevo. Si el veto es polvo o partículas solares, ninguna longitud sale, y se dice cuánto habría durado el plan sin esa alerta.

**Alternativas descartadas:**

- Puntaje único que mezcle ciencia, tiempo y seguridad. Un plan peligroso podría ganar por hacer más ciencia.
- Inventar un desvío cuando un tramo no tiene ruta segura. Solo se proponen planes cuyos tramos ya tienen tiempo calculado.
- Declarar telemetría en vivo. El polvo orbital es climatología de kilómetros; el sí o no de Jezero sale de la tabla Mastcam-Z y de MEDA del sol elegido.

**Consecuencias:**

- El astronauta ve el veto y, al lado, la ruta que sí cabe, con minutos, regreso y dosis.
- Las frases siguen siendo deterministas (ADR-009). No hay un modelo de lenguaje en el veredicto.
