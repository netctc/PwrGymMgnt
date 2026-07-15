# PowerGym Management — Evolución Incremental

## Especificación Funcional y Técnica

### Índice de documentos

| # | Documento | Contenido |
|---|-----------|-----------|
| 01 | [Resumen Ejecutivo](./01-EXECUTIVE-SUMMARY.md) | Visión general, alcance, exclusiones, supuestos |
| 02 | [Análisis del Sistema Actual](./02-CURRENT-SYSTEM.md) | Evidencia, arquitectura, modelo de datos existente |
| 03 | [Decisiones Arquitectónicas (ADRs)](./03-ARCHITECTURE-DECISIONS.md) | Registros de decisión |
| 04 | [Modelo Conceptual](./04-CONCEPTUAL-MODEL.md) | Plan, Suscripción, Afiliación, Ciclo, Saldo, Movimiento |
| 05 | [Planes y Configuración](./05-PLANS-CONFIG.md) | Tipos, versiones, beneficios, restricciones |
| 06 | [Suscripciones Multiusuario](./06-SUBSCRIPTIONS.md) | Titular, beneficiarios, límites, roles |
| 07 | [Afiliación Múltiple](./07-AFFILIATIONS.md) | Estados, independencia, selección |
| 08 | [Sesiones y Libro de Movimientos](./08-SESSION-LEDGER.md) | Distribución, cálculo, reserva, consumo, caducidad |
| 09 | [Concurrencia e Idempotencia](./09-CONCURRENCY.md) | Transacciones, bloqueos, outbox, reconciliación |
| 10 | [Ciclos y Reinicios](./10-CYCLES.md) | Cierre, asignación, acumulación, caducidad |
| 11 | [Control de Acceso Unificado](./11-ACCESS-AUTHORIZATION.md) | Motor común, QR, facial, manual |
| 12 | [Reconocimiento Facial](./12-FACIAL-RECOGNITION.md) | Arquitectura, alta, reconocimiento, umbrales |
| 13 | [Dispositivos y Paso Físico](./13-DEVICES-PASSAGE.md) | Órdenes de apertura, confirmación, compensación |
| 14 | [Modelo de Datos](./14-DATA-MODEL.md) | ERD, diccionario, entidades funcionales y biométricas |
| 15 | [Estados y Transiciones](./15-STATE-MACHINES.md) | Máquinas de estado por entidad |
| 16 | [Reglas de Negocio](./16-BUSINESS-RULES.md) | 30 reglas obligatorias |
| 17 | [Flujos Principales](./17-FLOWS.md) | Secuencias Mermaid para 20 flujos |
| 18 | [Diseño de API](./18-API-DESIGN.md) | Endpoints, contratos, errores |
| 19 | [Integración con Código Existente](./19-INTEGRATION.md) | Módulos, RBAC, migración de código |
| 20 | [Migración de Datos](./20-DATA-MIGRATION.md) | Estrategia, pasos, rollback |
| 21 | [Despliegue por Fases](./21-DEPLOYMENT-PHASES.md) | Fases 0-6, feature flags, criterios |
| 22 | [Plan de Reversión](./22-ROLLBACK-PLAN.md) | Procedimientos de vuelta atrás |
| 23 | [Casos Límite](./23-EDGE-CASES.md) | Sesiones, afiliaciones, reconocimiento, acceso |
| 24 | [Requisitos No Funcionales](./24-NON-FUNCTIONAL.md) | Latencia, disponibilidad, seguridad, privacidad |
| 25 | [Modelo de Amenazas](./25-THREAT-MODEL.md) | Amenazas biométricas y controles |
| 26 | [Privacidad y Legal](./26-PRIVACY-LEGAL.md) | DPIA, consentimiento, conservación |
| 27 | [Criterios de Aceptación](./27-ACCEPTANCE-CRITERIA.md) | Gherkin scenarios |
| 28 | [Plan de Pruebas](./28-TEST-PLAN.md) | Estrategia, tipos, herramientas |
| 29 | [Backlog Priorizado](./29-BACKLOG.md) | Épicas y historias por fase |
| 30 | [Matriz de Trazabilidad](./30-TRACEABILITY.md) | Requisito → API → Tabla → Prueba |

---

> **Nota**: Este documento es una especificación de diseño. No es código ejecutable.
> Las decisiones marcadas como "INFERIDA" o "NO DETERMINADA" requieren validación
> antes de la implementación.
