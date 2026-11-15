# ADR-012 · Mapas de polvo orbitales y alerta de Jezero medida

**Estado:** aceptada · 15-nov-2026

**Contexto:** la alerta de tormenta era un checkbox (ADR-008) porque los productos derivados de MEDA no traen opacidad. Hace falta mostrar dónde hay polvo en Marte y encender la alerta con una medición, no con un valor escrito a mano.

**Decisión:**

- El globo (y, si no hay WebGL2, un mapa plano de Leaflet) dibuja dos campos publicados, por estación de longitud solar Ls de 30°:
  - profundidad óptica de columna por absorción a 9,3 μm, normalizada a 610 Pa (Montabone et al., mapas krigeados MY24–MY36);
  - porcentaje de soles observados con una tormenta (MDAD v1.1, MY28–MY32).
- El mapa «típico» promedia todos los años menos MY25, MY28 y MY34, que tienen tormentas que rodearon el planeta. MY34 (la tormenta global de 2018) se puede ver aparte.
- La alerta de Jezero usa la mediana diaria de τ a 880 nm de Mastcam-Z. Se enciende sola si τ ≥ 1,0. El escenario de tormenta usa el máximo de esas medianas en los soles 313–317. El escenario típico y el peor usan la mediana de los demás soles 286–339: «peor» sigue siendo temperatura y viento. La tripulación puede forzar la alerta o apagarla.
- El umbral y las ventanas de soles viven en `config/model-parameters.json`.

**Qué no se redistribuye:**

- Los escenarios sintéticos de la Mars Climate Database (`dust_clim`, `dust_cold`, `dust_warm`). El caso frío baja el mínimo un 50 % y el cálido sube el máximo un 50 %. Además, las condiciones de la base completa piden no transmitir la base, ni en parte ni entera, a terceros.
- Un τ de MEDA/RDS reconstruido por nosotros. Lemmon et al. 2022 citan un pico visible del RDS cercano a 1,7; esa cifra no es una fila de la tabla de Mastcam-Z y no se copia como si lo fuera.

**Consecuencias:**

- La opacidad que decide la alerta es la del rover, no la celda orbital. La celda de profundidad óptica mide 3° (~180 km en el ecuador) y la de frecuencia 2° (~120 km). No separan las rutas dentro de Jezero.
- Los mapas de Montabone se publican aquí como obra derivada en CC BY-SA 3.0. MDAD y la tabla de Mastcam-Z, en CC BY 4.0.
- El texto antiguo «opacidad ~2» no es la medición de Mastcam-Z. En la tabla, el pico de los soles 316–317 es 1,38. El ~2 del artículo mezcla otras estimaciones (el resumen del artículo y el pico del RDS).
