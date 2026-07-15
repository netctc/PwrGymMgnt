# 01 — Resumen Ejecutivo

## Visión

Evolucionar PowerGym Management desde un sistema de membresía individual con acceso QR hacia una plataforma que soporte planes multiusuario, afiliación múltiple, sesiones limitadas transaccionales y reconocimiento facial como método adicional de acceso — sin reemplazar el monolito existente ni interrumpir la operación actual.

## Alcance

### Incluido

1. **Planes multiusuario**: Individual, familiar, grupal y corporativo con límite de integrantes.
2. **Sesiones limitadas**: Saldo por ciclo, distribución compartida/individual/personalizada.
3. **Afiliación múltiple**: Una persona puede tener varias afiliaciones activas simultáneas.
4. **Libro de movimientos inmutable**: Asignación, reserva, consumo, devolución, caducidad, ajuste.
5. **Motor de acceso unificado**: QR, facial y manual comparten reglas, idempotencia y auditoría.
6. **Reconocimiento facial**: Arquitectura edge + servicio biométrico aislado.
7. **Coexistencia con QR**: QR permanece como método primario y alternativa obligatoria.
8. **Migración compatible**: Datos históricos preservados, lectura dual, feature flags.

### Excluido

- Reescritura completa del monolito.
- Reemplazo de la base de datos MySQL.
- Procesamiento de vídeo dentro de `server.ts`.
- Almacenamiento continuo de vídeo.
- Eliminación del acceso QR existente.
- Asesoramiento jurídico definitivo.
- Selección de proveedor biométrico concreto.

## Supuestos

| ID | Supuesto | Validación requerida |
|----|----------|---------------------|
| S1 | El esquema MySQL real coincide con `sql/000_master_schema.sql` | Ejecutar `db:migrate` en staging |
| S2 | Firebase es residual y no se usa para autenticación activa | Confirmar con el equipo |
| S3 | No hay workers, colas ni WebSockets en producción | Confirmar infraestructura Render |
| S4 | El pool MySQL con 10 conexiones es suficiente para la carga actual | Medir en producción |
| S5 | La legislación aplicable permite biometría con consentimiento | Evaluación jurídica externa |
| S6 | Las cámaras disponibles soportan RTSP/ONVIF | Evaluar hardware |

## Dependencias

- Evaluación de impacto en protección de datos (DPIA) antes de Fase 5.
- Hardware de cámaras y nodo edge antes de Fase 5.
- Proveedor de reconocimiento facial evaluado antes de Fase 5.
- MySQL staging idéntico a producción para validar migraciones.

## Principios de diseño

1. **Compatibilidad**: No romper lo que funciona.
2. **Gradualidad**: Feature flags por funcionalidad.
3. **Reversibilidad**: Cada fase tiene rollback documentado.
4. **Privacidad por diseño**: Minimización, separación, cifrado, consentimiento.
5. **Integridad transaccional**: Movimientos inmutables, idempotencia, sin caché autoritativa.
6. **Falsos positivos mínimos**: Preferir rechazo seguro sobre autorización dudosa.
7. **Alternativa no biométrica siempre disponible**.

## Grado de certeza

| Clasificación | Significado |
|---------------|-------------|
| CONFIRMADA | Respaldada por código fuente inspeccionado |
| INFERIDA | Conclusión razonable que debe validarse |
| NO DETERMINADA | Requiere ejecución, inspección del esquema real o consulta al equipo |
