# 03 — Decisiones Arquitectónicas (ADRs)

## ADR-001: Mantener el monolito como sistema de registro

- **Contexto**: PowerGym es un monolito Express+React funcional en producción.
- **Decisión**: No reemplazar el monolito. Extenderlo con módulos internos y extraer servicios gradualmente.
- **Alternativas**: Microservicios desde el inicio (rechazado por complejidad operativa prematura).
- **Consecuencias**: Menor riesgo de interrupción; mayor disciplina en modularización interna.
- **Riesgos**: El monolito puede crecer excesivamente si no se extrae lógica a servicios/repositorios.
- **Revisión**: Cuando el ledger de sesiones o el servicio biométrico requieran escala independiente.

---

## ADR-002: Libro de movimientos inmutable como fuente de verdad de saldo

- **Contexto**: El saldo de sesiones debe ser auditable, reconciliable y resistente a errores.
- **Decisión**: Usar un ledger append-only (`session_movements`) como fuente autoritativa. Los saldos materializados (`session_balances`) se actualizan transaccionalmente pero son derivados.
- **Alternativas**: Columna mutable de saldo (rechazado por no auditable); CQRS con event store (rechazado por complejidad prematura).
- **Consecuencias**: Trazabilidad completa; reconciliación posible; mayor complejidad en queries de saldo.
- **Riesgos**: Volumen de filas en ledger a largo plazo → particionado por fecha.
- **Revisión**: Si el volumen supera 10M movimientos/año por sede.

---

## ADR-003: Motor de acceso unificado

- **Contexto**: QR, rostro y validación manual deben aplicar las mismas reglas.
- **Decisión**: Crear `AccessAuthorizationService` invocado por todos los métodos de identificación.
- **Alternativas**: Lógica separada por método (rechazado por duplicación y divergencia de reglas).
- **Consecuencias**: Consistencia garantizada; un solo punto de mantenimiento de reglas.
- **Riesgos**: Latencia adicional si el servicio biométrico es lento.
- **Revisión**: Si se requieren decisiones de acceso con latencia < 100ms que el monolito no pueda garantizar.

---

## ADR-004: Servicio biométrico aislado

- **Contexto**: Las plantillas faciales son datos especialmente sensibles y el procesamiento de vídeo requiere GPU.
- **Decisión**: Aislar el almacenamiento y comparación de plantillas en un servicio separado. No almacenar plantillas en el monolito ni en `audit_logs`.
- **Alternativas**: Integrar en el monolito (rechazado por privacidad y rendimiento); servicio cloud exclusivo (rechazado por dependencia de latencia).
- **Consecuencias**: Separación de responsabilidades; escalado independiente; complejidad operativa añadida.
- **Riesgos**: Punto de fallo adicional → QR como fallback obligatorio.
- **Revisión**: Al seleccionar proveedor biométrico concreto.

---

## ADR-005: Nodo edge por sede para procesamiento de vídeo

- **Contexto**: El monolito no puede procesar streams RTSP. La latencia cloud para vídeo es excesiva.
- **Decisión**: Un nodo local por sede que conecta a cámaras, detecta rostros, aplica prueba de vida y envía eventos discretos al backend.
- **Alternativas**: Procesamiento en cloud (rechazado por latencia); procesamiento en el monolito (rechazado por incompatibilidad arquitectónica).
- **Consecuencias**: Latencia baja; dependencia de hardware local; necesidad de mantenimiento remoto.
- **Riesgos**: Complejidad de despliegue y actualización del edge.
- **Revisión**: Cuando el proveedor biométrico ofrezca API cloud con latencia < 500ms.

---

## ADR-006: Versionado de planes mediante snapshot en suscripción

- **Contexto**: Un cambio comercial en un plan no debe alterar suscripciones históricas.
- **Decisión**: Crear `plan_versions` con condiciones inmutables. Cada suscripción referencia una versión específica.
- **Alternativas**: Copiar campos directamente en la suscripción (rechazado por redundancia excesiva); no versionar (rechazado por inconsistencia histórica).
- **Consecuencias**: Los planes pueden evolucionar libremente; las suscripciones conservan sus condiciones originales.
- **Riesgos**: Complejidad en queries que necesitan condiciones vigentes vs históricas.
- **Revisión**: Si se requiere un modelo de precios dinámico en tiempo real.

---

## ADR-007: Feature flags para activación gradual

- **Contexto**: Los cambios afectan a planes, suscripciones, acceso y biometría. Desplegarlos todos simultáneamente es arriesgado.
- **Decisión**: Tabla `feature_flags` con activación por funcionalidad, sede, rol o grupo de usuarios.
- **Alternativas**: Ramas de código largas (rechazado por merge hell); despliegue big-bang (rechazado por riesgo).
- **Consecuencias**: Despliegue continuo seguro; complejidad de código condicional temporal.
- **Riesgos**: Flags olvidados → proceso de limpieza obligatorio por fase.
- **Revisión**: Tras cada fase completada, eliminar flags obsoletos.

---

## ADR-008: Separación de miembros_suscripcion y afiliaciones

- **Contexto**: ¿Debe una persona tener relación administrativa (miembro del grupo) Y relación funcional (derecho a consumir)?
- **Decisión**: `subscription_members` = relación administrativa con la suscripción. `affiliations` = derecho individual temporal a consumir beneficios. Coexisten.
- **Alternativas**: Unificar en una sola entidad (rechazado porque mezcla ciclos de vida diferentes: un integrante puede estar activo administrativamente pero con afiliación suspendida).
- **Consecuencias**: Mayor granularidad; posibilidad de congelar consumo sin retirar del grupo.
- **Riesgos**: Sincronización entre ambas entidades → reglas de consistencia explícitas.
- **Revisión**: Si la distinción resulta confusa para operadores → evaluar simplificación UI.

---

## ADR-009: Outbox transaccional para efectos externos

- **Contexto**: Después de consumir una sesión, pueden requerirse acciones externas (abrir puerta, notificar, emitir factura). Si el HTTP falla después del commit, se pierde la acción.
- **Decisión**: Usar tabla `outbox_events` escrita en la misma transacción que el consumo. Un proceso separado drena la outbox y ejecuta efectos.
- **Alternativas**: Ejecutar efectos en la misma request (rechazado por fragilidad); broker externo desde el inicio (rechazado por complejidad prematura).
- **Consecuencias**: Garantía de entrega eventual; complejidad moderada; necesidad de un drenador.
- **Riesgos**: Latencia entre commit y efecto. Para apertura de puerta, la orden debe emitirse inmediatamente → optimización especial para comandos de apertura.
- **Revisión**: Cuando se introduzca un broker de mensajería (Fase 6).

---

## ADR-010: Caché local no autoritativa

- **Contexto**: El sistema usa caché en memoria para queries GET. Se podría usar para saldos.
- **Decisión**: La caché NO decide saldos, bloqueos, idempotencia ni permisos críticos. Solo para lecturas no críticas.
- **Alternativas**: Redis como caché autoritativa (evaluable en fases posteriores); caché local autoritativa (rechazado por inconsistencia entre réplicas).
- **Consecuencias**: Cada decisión de consumo consulta MySQL transaccionalmente.
- **Riesgos**: Mayor carga en MySQL → optimizar con índices y connection pooling.
- **Revisión**: Si la latencia de acceso supera el SLO → introducir Redis para lecturas de saldo.
