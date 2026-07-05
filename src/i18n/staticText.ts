import type { SupportedLocale } from './config';
import { expandedStaticTextTranslations } from './staticTextExpanded';

export type StaticTextTranslations = Partial<Record<Exclude<SupportedLocale, 'en'>, string>>;

export const staticTextTranslations: Record<string, StaticTextTranslations> = {
  'PowerGym Management': { fr: 'Gestion PowerGym', ar: 'إدارة باور جيم', es: 'Gestión PowerGym' },
  'PowerGym Management system': { fr: 'Système de gestion PowerGym', ar: 'نظام إدارة باور جيم', es: 'Sistema de gestión PowerGym' },
  'Dashboard': { fr: 'Tableau de bord', ar: 'لوحة التحكم', es: 'Panel' },
  "Here's what's happening today.": { fr: "Voici ce qui se passe aujourd'hui.", ar: 'إليك ما يحدث اليوم.', es: 'Esto es lo que ocurre hoy.' },
  'Classes Today': { fr: "Cours aujourd'hui", ar: 'الحصص اليوم', es: 'Clases de hoy' },
  'Occupancy Rate': { fr: "Taux d'occupation", ar: 'معدل الإشغال', es: 'Tasa de ocupación' },
  'Smart Action Center': { fr: "Centre d'actions intelligent", ar: 'مركز الإجراءات الذكي', es: 'Centro de acciones inteligente' },
  'Prioritized operational actions generated from membership, HR, warehouse, finance, support, and notification data.': { fr: "Actions opérationnelles prioritaires générées à partir des données membres, RH, entrepôt, finance, support et notifications.", ar: 'إجراءات تشغيلية ذات أولوية مستخرجة من بيانات العضوية والموارد البشرية والمستودع والمالية والدعم والإشعارات.', es: 'Acciones operativas priorizadas generadas a partir de datos de membresía, RR. HH., almacén, finanzas, soporte y notificaciones.' },
  'Loading action center...': { fr: "Chargement du centre d'actions...", ar: 'جار تحميل مركز الإجراءات...', es: 'Cargando centro de acciones...' },
  'No urgent operational actions.': { fr: 'Aucune action opérationnelle urgente.', ar: 'لا توجد إجراءات تشغيلية عاجلة.', es: 'No hay acciones operativas urgentes.' },
  'Critical': { fr: 'Critique', ar: 'حرج', es: 'Crítico' },
  'Warning': { fr: 'Avertissement', ar: 'تحذير', es: 'Advertencia' },
  'Info': { fr: 'Info', ar: 'معلومة', es: 'Información' },
  'HR KPI Metrics': { fr: 'Indicateurs RH', ar: 'مؤشرات الموارد البشرية', es: 'Indicadores de RR. HH.' },
  'Active Duty Staff': { fr: 'Personnel en service', ar: 'الموظفون المناوبون', es: 'Personal activo' },
  'On shift right now': { fr: 'Actuellement en poste', ar: 'في المناوبة الآن', es: 'En turno ahora' },
  'Understaffed Departments': { fr: 'Départements en sous-effectif', ar: 'الأقسام ناقصة الموظفين', es: 'Departamentos con falta de personal' },
  'Based on shift requirements': { fr: 'Selon les besoins de planning', ar: 'بناءً على متطلبات المناوبة', es: 'Según los requisitos de turno' },
  'Pending Contracts': { fr: 'Contrats en attente', ar: 'العقود المعلقة', es: 'Contratos pendientes' },
  'Awaiting HR Approval': { fr: "En attente d'approbation RH", ar: 'بانتظار موافقة الموارد البشرية', es: 'Pendiente de aprobación de RR. HH.' },
  'Upcoming Classes (7 Days)': { fr: 'Cours à venir (7 jours)', ar: 'الحصص القادمة (7 أيام)', es: 'Próximas clases (7 días)' },
  'Active Subscriptions Breakdown': { fr: 'Répartition des abonnements actifs', ar: 'تفصيل الاشتراكات النشطة', es: 'Desglose de suscripciones activas' },
  'No active subscriptions data available': { fr: "Aucune donnée d'abonnement actif disponible", ar: 'لا توجد بيانات اشتراكات نشطة', es: 'No hay datos de suscripciones activas disponibles' },
  'HR Payroll Analytics': { fr: 'Analytique paie RH', ar: 'تحليلات رواتب الموارد البشرية', es: 'Analítica de nómina de RR. HH.' },
  'Department Salary Distribution': { fr: 'Répartition des salaires par département', ar: 'توزيع الرواتب حسب القسم', es: 'Distribución salarial por departamento' },
  'No payroll distribution data available': { fr: 'Aucune donnée de répartition de paie disponible', ar: 'لا توجد بيانات لتوزيع الرواتب', es: 'No hay datos de distribución de nómina disponibles' },
  'New Members (Last 12 Months)': { fr: 'Nouveaux membres (12 derniers mois)', ar: 'الأعضاء الجدد (آخر 12 شهرًا)', es: 'Nuevos miembros (últimos 12 meses)' },
  'Trainer Utilization (Last 30 Days)': { fr: 'Utilisation des coachs (30 derniers jours)', ar: 'استخدام المدربين (آخر 30 يومًا)', es: 'Utilización de entrenadores (últimos 30 días)' },
  'Upcoming Classes': { fr: 'Cours à venir', ar: 'الحصص القادمة', es: 'Próximas clases' },
  'Loading utilization data...': { fr: "Chargement des données d'utilisation...", ar: 'جار تحميل بيانات الاستخدام...', es: 'Cargando datos de utilización...' },
  'No trainer data available.': { fr: 'Aucune donnée coach disponible.', ar: 'لا توجد بيانات مدربين.', es: 'No hay datos de entrenadores disponibles.' },

  'Members': { fr: 'Membres', ar: 'الأعضاء', es: 'Miembros' },
  'Member Management': { fr: 'Gestion des membres', ar: 'إدارة الأعضاء', es: 'Gestión de miembros' },
  'Add Member': { fr: 'Ajouter un membre', ar: 'إضافة عضو', es: 'Agregar miembro' },
  'Edit Member': { fr: 'Modifier le membre', ar: 'تعديل العضو', es: 'Editar miembro' },
  'Full Name': { fr: 'Nom complet', ar: 'الاسم الكامل', es: 'Nombre completo' },
  'Full Name *': { fr: 'Nom complet *', ar: 'الاسم الكامل *', es: 'Nombre completo *' },
  'Email': { fr: 'E-mail', ar: 'البريد الإلكتروني', es: 'Correo electrónico' },
  'Email Address *': { fr: 'Adresse e-mail *', ar: 'عنوان البريد الإلكتروني *', es: 'Correo electrónico *' },
  'Phone': { fr: 'Téléphone', ar: 'الهاتف', es: 'Teléfono' },
  'Phone Number': { fr: 'Numéro de téléphone', ar: 'رقم الهاتف', es: 'Número de teléfono' },
  'Status': { fr: 'Statut', ar: 'الحالة', es: 'Estado' },
  'Active': { fr: 'Actif', ar: 'نشط', es: 'Activo' },
  'Inactive': { fr: 'Inactif', ar: 'غير نشط', es: 'Inactivo' },
  'Expired': { fr: 'Expiré', ar: 'منتهي', es: 'Vencido' },
  'Pending': { fr: 'En attente', ar: 'معلق', es: 'Pendiente' },
  'Name': { fr: 'Nom', ar: 'الاسم', es: 'Nombre' },
  'Plan': { fr: 'Abonnement', ar: 'الخطة', es: 'Plan' },
  'Actions': { fr: 'Actions', ar: 'الإجراءات', es: 'Acciones' },
  'Save': { fr: 'Enregistrer', ar: 'حفظ', es: 'Guardar' },
  'Cancel': { fr: 'Annuler', ar: 'إلغاء', es: 'Cancelar' },
  'Delete': { fr: 'Supprimer', ar: 'حذف', es: 'Eliminar' },
  'Edit': { fr: 'Modifier', ar: 'تعديل', es: 'Editar' },
  'View': { fr: 'Voir', ar: 'عرض', es: 'Ver' },
  'Search': { fr: 'Rechercher', ar: 'بحث', es: 'Buscar' },
  'Filter': { fr: 'Filtrer', ar: 'تصفية', es: 'Filtrar' },
  'Clear filters': { fr: 'Effacer les filtres', ar: 'مسح عوامل التصفية', es: 'Borrar filtros' },
  'Submit': { fr: 'Soumettre', ar: 'إرسال', es: 'Enviar' },
  'Create': { fr: 'Créer', ar: 'إنشاء', es: 'Crear' },
  'Update': { fr: 'Mettre à jour', ar: 'تحديث', es: 'Actualizar' },
  'Close': { fr: 'Fermer', ar: 'إغلاق', es: 'Cerrar' },
  'Close menu': { fr: 'Fermer le menu', ar: 'إغلاق القائمة', es: 'Cerrar menú' },
  'Loading...': { fr: 'Chargement...', ar: 'جار التحميل...', es: 'Cargando...' },
  'No records found.': { fr: 'Aucun enregistrement trouvé.', ar: 'لم يتم العثور على سجلات.', es: 'No se encontraron registros.' },
  'No data available': { fr: 'Aucune donnée disponible', ar: 'لا توجد بيانات', es: 'No hay datos disponibles' },
  'From': { fr: 'Du', ar: 'من', es: 'Desde' },
  'To': { fr: 'Au', ar: 'إلى', es: 'Hasta' },
  'Date': { fr: 'Date', ar: 'التاريخ', es: 'Fecha' },
  'Description': { fr: 'Description', ar: 'الوصف', es: 'Descripción' },
  'Amount': { fr: 'Montant', ar: 'المبلغ', es: 'Importe' },
  'Category': { fr: 'Catégorie', ar: 'الفئة', es: 'Categoría' },
  'Type': { fr: 'Type', ar: 'النوع', es: 'Tipo' },
  'Priority': { fr: 'Priorité', ar: 'الأولوية', es: 'Prioridad' },
  'Low': { fr: 'Basse', ar: 'منخفضة', es: 'Baja' },
  'Normal': { fr: 'Normale', ar: 'عادية', es: 'Normal' },
  'High': { fr: 'Élevée', ar: 'مرتفعة', es: 'Alta' },
  'Urgent': { fr: 'Urgente', ar: 'عاجلة', es: 'Urgente' },
  'Subject': { fr: 'Objet', ar: 'الموضوع', es: 'Asunto' },
  'User': { fr: 'Utilisateur', ar: 'المستخدم', es: 'Usuario' },
  'Timestamp': { fr: 'Horodatage', ar: 'الطابع الزمني', es: 'Marca de tiempo' },
  'Notes': { fr: 'Notes', ar: 'ملاحظات', es: 'Notas' },

  'Plans': { fr: 'Abonnements', ar: 'الاشتراكات', es: 'Planes' },
  'Membership Plans': { fr: "Plans d'abonnement", ar: 'خطط العضوية', es: 'Planes de membresía' },
  'Create Plan': { fr: 'Créer un abonnement', ar: 'إنشاء خطة', es: 'Crear plan' },
  'Plan Name': { fr: "Nom de l'abonnement", ar: 'اسم الخطة', es: 'Nombre del plan' },
  'Duration': { fr: 'Durée', ar: 'المدة', es: 'Duración' },
  'Price': { fr: 'Prix', ar: 'السعر', es: 'Precio' },
  'Features': { fr: 'Fonctionnalités', ar: 'الميزات', es: 'Características' },

  'Classes': { fr: 'Cours', ar: 'الحصص', es: 'Clases' },
  'Class Management': { fr: 'Gestion des cours', ar: 'إدارة الحصص', es: 'Gestión de clases' },
  'Private PT': { fr: 'Coaching privé', ar: 'تدريب خاص', es: 'Entrenamiento privado' },
  'Private Classes': { fr: 'Cours privés', ar: 'حصص خاصة', es: 'Clases privadas' },
  'Trainer': { fr: 'Coach', ar: 'المدرب', es: 'Entrenador' },
  'Instructor': { fr: 'Instructeur', ar: 'المدرب', es: 'Instructor' },
  'Start Time': { fr: 'Heure de début', ar: 'وقت البدء', es: 'Hora de inicio' },
  'End Time': { fr: 'Heure de fin', ar: 'وقت الانتهاء', es: 'Hora de fin' },
  'Capacity': { fr: 'Capacité', ar: 'السعة', es: 'Capacidad' },
  'Bookings': { fr: 'Réservations', ar: 'الحجوزات', es: 'Reservas' },
  'Resources': { fr: 'Ressources', ar: 'الموارد', es: 'Recursos' },

  'Employees': { fr: 'Employés', ar: 'الموظفون', es: 'Empleados' },
  'HR & Payroll': { fr: 'RH & paie', ar: 'الموارد البشرية والرواتب', es: 'RR. HH. y nómina' },
  'Human Resources': { fr: 'Ressources humaines', ar: 'الموارد البشرية', es: 'Recursos humanos' },
  'Payroll': { fr: 'Paie', ar: 'الرواتب', es: 'Nómina' },
  'Department': { fr: 'Département', ar: 'القسم', es: 'Departamento' },
  'Position': { fr: 'Poste', ar: 'المنصب', es: 'Puesto' },
  'Salary': { fr: 'Salaire', ar: 'الراتب', es: 'Salario' },
  'Attendance': { fr: 'Présence', ar: 'الحضور', es: 'Asistencia' },
  'Contract': { fr: 'Contrat', ar: 'العقد', es: 'Contrato' },
  'Approve': { fr: 'Approuver', ar: 'موافقة', es: 'Aprobar' },
  'Reject': { fr: 'Rejeter', ar: 'رفض', es: 'Rechazar' },

  'Accounting': { fr: 'Comptabilité', ar: 'المحاسبة', es: 'Contabilidad' },
  'Finance': { fr: 'Finance', ar: 'المالية', es: 'Finanzas' },
  'Transactions': { fr: 'Transactions', ar: 'المعاملات', es: 'Transacciones' },
  'Transaction': { fr: 'Transaction', ar: 'معاملة', es: 'Transacción' },
  'Income': { fr: 'Revenu', ar: 'إيراد', es: 'Ingreso' },
  'Expense': { fr: 'Dépense', ar: 'مصروف', es: 'Gasto' },
  'Budgets': { fr: 'Budgets', ar: 'الميزانيات', es: 'Presupuestos' },
  'Loans': { fr: 'Prêts', ar: 'القروض', es: 'Préstamos' },
  'Rentals': { fr: 'Locations', ar: 'الإيجارات', es: 'Alquileres' },
  'Summary': { fr: 'Résumé', ar: 'الملخص', es: 'Resumen' },
  'Paid': { fr: 'Payé', ar: 'مدفوع', es: 'Pagado' },
  'Draft': { fr: 'Brouillon', ar: 'مسودة', es: 'Borrador' },
  'Posted': { fr: 'Comptabilisé', ar: 'مرحل', es: 'Registrado' },

  'Warehouse': { fr: 'Entrepôt', ar: 'المستودع', es: 'Almacén' },
  'Warehouse & POS': { fr: 'Entrepôt & PDV', ar: 'المستودع ونقطة البيع', es: 'Almacén y TPV' },
  'Inventory, purchasing, POS and accounting synchronization in one operational workspace.': { fr: "Inventaire, achats, PDV et synchronisation comptable dans un seul espace opérationnel.", ar: 'المخزون والمشتريات ونقطة البيع والمزامنة المحاسبية في مساحة تشغيلية واحدة.', es: 'Inventario, compras, TPV y sincronización contable en un único espacio operativo.' },
  'Warehouse data error': { fr: 'Erreur de données entrepôt', ar: 'خطأ في بيانات المستودع', es: 'Error de datos de almacén' },
  'Loading details': { fr: 'Chargement des détails', ar: 'جار تحميل التفاصيل', es: 'Cargando detalles' },
  'Retrieving latest warehouse detail data...': { fr: "Récupération des derniers détails d'entrepôt...", ar: 'جار استرجاع أحدث تفاصيل المستودع...', es: 'Recuperando los últimos detalles del almacén...' },
  'Stock Valuation': { fr: 'Valorisation du stock', ar: 'تقييم المخزون', es: 'Valoración de stock' },
  'Inventory asset value': { fr: "Valeur d'actif inventaire", ar: 'قيمة أصل المخزون', es: 'Valor del activo de inventario' },
  'Today POS Sales': { fr: 'Ventes PDV du jour', ar: 'مبيعات نقطة البيع اليوم', es: 'Ventas TPV de hoy' },
  'Open POs': { fr: 'BC ouverts', ar: 'طلبات الشراء المفتوحة', es: 'OC abiertas' },
  'Categories': { fr: 'Catégories', ar: 'الفئات', es: 'Categorías' },
  'Active hierarchy nodes': { fr: 'Nœuds hiérarchiques actifs', ar: 'عناصر التسلسل النشطة', es: 'Nodos de jerarquía activos' },
  'Inventory command center': { fr: 'Centre de contrôle inventaire', ar: 'مركز قيادة المخزون', es: 'Centro de control de inventario' },
  'Live stock position': { fr: 'Position de stock en direct', ar: 'وضع المخزون المباشر', es: 'Posición de stock en vivo' },
  'Manage Inventory': { fr: "Gérer l'inventaire", ar: 'إدارة المخزون', es: 'Gestionar inventario' },
  'Total SKUs': { fr: 'Total SKU', ar: 'إجمالي رموز المنتجات', es: 'Total de SKU' },
  'Catalog items': { fr: 'Articles catalogue', ar: 'عناصر الكتالوج', es: 'Artículos del catálogo' },
  'Low Stock': { fr: 'Stock faible', ar: 'مخزون منخفض', es: 'Stock bajo' },
  'Requires replenishment': { fr: 'Nécessite réapprovisionnement', ar: 'يتطلب إعادة التزويد', es: 'Requiere reposición' },
  'Accounting Bridge': { fr: 'Passerelle comptable', ar: 'جسر المحاسبة', es: 'Puente contable' },
  'POS, COGS and POs sync automatically': { fr: 'PDV, CMV et BC se synchronisent automatiquement', ar: 'تتم مزامنة نقطة البيع وتكلفة البضائع وطلبات الشراء تلقائيًا', es: 'TPV, COGS y OC se sincronizan automáticamente' },
  'Replenishment priority': { fr: 'Priorité de réapprovisionnement', ar: 'أولوية إعادة التزويد', es: 'Prioridad de reposición' },
  'Low stock / out of stock': { fr: 'Stock faible / rupture', ar: 'مخزون منخفض / نفد المخزون', es: 'Stock bajo / agotado' },
  'No urgent replenishment items.': { fr: 'Aucun article urgent à réapprovisionner.', ar: 'لا توجد عناصر عاجلة لإعادة التزويد.', es: 'No hay artículos urgentes de reposición.' },
  'Dashboard / Inventory': { fr: 'Tableau de bord / Inventaire', ar: 'لوحة التحكم / المخزون', es: 'Panel / Inventario' },
  'Inventory Management': { fr: "Gestion de l'inventaire", ar: 'إدارة المخزون', es: 'Gestión de inventario' },
  'All Products': { fr: 'Tous les produits', ar: 'كل المنتجات', es: 'Todos los productos' },
  'All stock': { fr: 'Tout le stock', ar: 'كل المخزون', es: 'Todo el stock' },
  'In stock': { fr: 'En stock', ar: 'متوفر', es: 'En stock' },
  'Out of stock': { fr: 'Rupture de stock', ar: 'نفد المخزون', es: 'Sin stock' },
  'Overstock': { fr: 'Surstock', ar: 'فائض المخزون', es: 'Exceso de stock' },
  'Product Catalog': { fr: 'Catalogue produits', ar: 'كتالوج المنتجات', es: 'Catálogo de productos' },
  'No products found': { fr: 'Aucun produit trouvé', ar: 'لم يتم العثور على منتجات', es: 'No se encontraron productos' },
  'Create a product or clear filters.': { fr: 'Créez un produit ou effacez les filtres.', ar: 'أنشئ منتجًا أو امسح عوامل التصفية.', es: 'Cree un producto o borre los filtros.' },
  'Image': { fr: 'Image', ar: 'الصورة', es: 'Imagen' },
  'SKU': { fr: 'SKU', ar: 'رمز المنتج', es: 'SKU' },
  'Product Name': { fr: 'Nom du produit', ar: 'اسم المنتج', es: 'Nombre del producto' },
  'Stock': { fr: 'Stock', ar: 'المخزون', es: 'Stock' },
  'Cost': { fr: 'Coût', ar: 'التكلفة', es: 'Costo' },
  'Retail': { fr: 'Vente', ar: 'سعر البيع', es: 'Venta' },
  'Create replenishment PO': { fr: 'Créer un BC de réapprovisionnement', ar: 'إنشاء طلب شراء لإعادة التزويد', es: 'Crear OC de reposición' },
  'Category Management': { fr: 'Gestion des catégories', ar: 'إدارة الفئات', es: 'Gestión de categorías' },
  'Hierarchy / sub-categories / reporting': { fr: 'Hiérarchie / sous-catégories / reporting', ar: 'التسلسل / الفئات الفرعية / التقارير', es: 'Jerarquía / subcategorías / informes' },
  'No categories': { fr: 'Aucune catégorie', ar: 'لا توجد فئات', es: 'Sin categorías' },
  'Create the first inventory category.': { fr: "Créez la première catégorie d'inventaire.", ar: 'أنشئ أول فئة مخزون.', es: 'Cree la primera categoría de inventario.' },
  'Update Product': { fr: 'Mettre à jour le produit', ar: 'تحديث المنتج', es: 'Actualizar producto' },
  'Create Product': { fr: 'Créer un produit', ar: 'إنشاء منتج', es: 'Crear producto' },
  'Stock Adjustment': { fr: 'Ajustement de stock', ar: 'تعديل المخزون', es: 'Ajuste de stock' },
  'Inventory correction / transfer note': { fr: 'Correction inventaire / note de transfert', ar: 'تصحيح المخزون / ملاحظة تحويل', es: 'Corrección de inventario / nota de transferencia' },
  'Product': { fr: 'Produit', ar: 'المنتج', es: 'Producto' },
  'Select product': { fr: 'Sélectionner un produit', ar: 'اختر منتجًا', es: 'Seleccionar producto' },
  'Post Adjustment': { fr: "Valider l'ajustement", ar: 'ترحيل التعديل', es: 'Publicar ajuste' },
  'Price tier: Member': { fr: 'Niveau de prix : membre', ar: 'فئة السعر: عضو', es: 'Nivel de precio: miembro' },
  'PDF': { fr: 'PDF', ar: 'PDF', es: 'PDF' },
  'CSV': { fr: 'CSV', ar: 'CSV', es: 'CSV' },
  'Warehouse detail': { fr: 'Détail entrepôt', ar: 'تفاصيل المستودع', es: 'Detalle de almacén' },
  'No image': { fr: 'Aucune image', ar: 'لا توجد صورة', es: 'Sin imagen' },
  'Current Stock': { fr: 'Stock actuel', ar: 'المخزون الحالي', es: 'Stock actual' },
  'Stock Value': { fr: 'Valeur du stock', ar: 'قيمة المخزون', es: 'Valor de stock' },
  'Cost valuation': { fr: 'Valorisation au coût', ar: 'تقييم بالتكلفة', es: 'Valoración al costo' },
  'Retail Price': { fr: 'Prix de vente', ar: 'سعر البيع', es: 'Precio de venta' },
  'Default POS price': { fr: 'Prix PDV par défaut', ar: 'سعر نقطة البيع الافتراضي', es: 'Precio TPV predeterminado' },
  'No expiry': { fr: "Pas d'expiration", ar: 'لا يوجد انتهاء', es: 'Sin vencimiento' },
  'Transaction history': { fr: 'Historique des transactions', ar: 'سجل المعاملات', es: 'Historial de transacciones' },
  'Purchase history': { fr: "Historique d'achat", ar: 'سجل الشراء', es: 'Historial de compras' },
  'Sales history': { fr: 'Historique des ventes', ar: 'سجل المبيعات', es: 'Historial de ventas' },
  'Linked accounting entries': { fr: 'Écritures comptables liées', ar: 'قيود محاسبية مرتبطة', es: 'Asientos contables vinculados' },
  'Supplier': { fr: 'Fournisseur', ar: 'المورد', es: 'Proveedor' },
  'Unknown Supplier': { fr: 'Fournisseur inconnu', ar: 'مورد غير معروف', es: 'Proveedor desconocido' },
  'Print': { fr: 'Imprimer', ar: 'طباعة', es: 'Imprimir' },
  'Mark Shipped': { fr: 'Marquer expédié', ar: 'تحديد كشُحن', es: 'Marcar enviado' },
  'Receive': { fr: 'Réceptionner', ar: 'استلام', es: 'Recibir' },
  'Mark Invoiced': { fr: 'Marquer facturé', ar: 'تحديد كمفوتر', es: 'Marcar facturado' },
  'Order Date': { fr: 'Date de commande', ar: 'تاريخ الطلب', es: 'Fecha de pedido' },
  'Total': { fr: 'Total', ar: 'الإجمالي', es: 'Total' },
  'Products on order': { fr: 'Produits commandés', ar: 'المنتجات في الطلب', es: 'Productos en pedido' },
  'Status workflow history': { fr: 'Historique du workflow de statut', ar: 'سجل سير حالة الطلب', es: 'Historial del flujo de estado' },
  'Qty': { fr: 'Qté', ar: 'الكمية', es: 'Cant.' },
  'Unit Cost': { fr: 'Coût unitaire', ar: 'تكلفة الوحدة', es: 'Costo unitario' },
  'Receipt': { fr: 'Reçu', ar: 'إيصال', es: 'Recibo' },
  'After': { fr: 'Après', ar: 'بعد', es: 'Después' },
  'PO': { fr: 'BC', ar: 'طلب شراء', es: 'OC' },
  'From Status': { fr: 'Statut source', ar: 'الحالة السابقة', es: 'Estado anterior' },
  'To Status': { fr: 'Statut cible', ar: 'الحالة الجديدة', es: 'Estado nuevo' },

  'Reports': { fr: 'Rapports', ar: 'التقارير', es: 'Informes' },
  'Support': { fr: 'Support', ar: 'الدعم', es: 'Soporte' },
  'Support & Contact': { fr: 'Support & contact', ar: 'الدعم والتواصل', es: 'Soporte y contacto' },
  'Create support tickets, track responses, and contact Assaf IT Consulting & Support.': { fr: 'Créez des tickets, suivez les réponses et contactez Assaf IT Consulting & Support.', ar: 'أنشئ تذاكر دعم، وتتبع الردود، وتواصل مع Assaf IT Consulting & Support.', es: 'Cree tickets de soporte, haga seguimiento de respuestas y contacte con Assaf IT Consulting & Support.' },
  'Support screen PDFs': { fr: 'PDF écran support', ar: 'ملفات PDF لشاشة الدعم', es: 'PDF de pantalla de soporte' },
  'Select type': { fr: 'Sélectionner le type', ar: 'اختر النوع', es: 'Seleccione tipo' },
  'Technical Support': { fr: 'Support technique', ar: 'دعم فني', es: 'Soporte técnico' },
  'Commercial Inquiry': { fr: 'Demande commerciale', ar: 'استفسار تجاري', es: 'Consulta comercial' },
  'Billing': { fr: 'Facturation', ar: 'الفوترة', es: 'Facturación' },
  'Feature Request': { fr: 'Demande de fonctionnalité', ar: 'طلب ميزة', es: 'Solicitud de función' },
  'Short issue summary': { fr: 'Résumé court du problème', ar: 'ملخص قصير للمشكلة', es: 'Resumen breve del problema' },
  'Description *': { fr: 'Description *', ar: 'الوصف *', es: 'Descripción *' },
  'Provide details about your inquiry...': { fr: 'Fournissez les détails de votre demande...', ar: 'قدم تفاصيل حول استفسارك...', es: 'Proporcione detalles sobre su consulta...' },
  'Track recent support and commercial requests.': { fr: 'Suivez les demandes récentes de support et commerciales.', ar: 'تتبع طلبات الدعم والطلبات التجارية الأخيرة.', es: 'Haga seguimiento de solicitudes recientes de soporte y comerciales.' },
  'Company Info': { fr: 'Infos société', ar: 'معلومات الشركة', es: 'Información de la empresa' },
  'Contact Details': { fr: 'Coordonnées', ar: 'تفاصيل التواصل', es: 'Datos de contacto' },
  'Phone & WhatsApp': { fr: 'Téléphone & WhatsApp', ar: 'الهاتف وواتساب', es: 'Teléfono y WhatsApp' },
  'Office Hours': { fr: 'Horaires de bureau', ar: 'ساعات العمل', es: 'Horario de oficina' },
  'Expected response: within 2 business hours': { fr: 'Réponse prévue : sous 2 heures ouvrées', ar: 'الرد المتوقع: خلال ساعتين عمل', es: 'Respuesta esperada: en 2 horas hábiles' },

  'Settings': { fr: 'Paramètres', ar: 'الإعدادات', es: 'Configuración' },
  'General Settings': { fr: 'Paramètres généraux', ar: 'الإعدادات العامة', es: 'Configuración general' },
  'Security': { fr: 'Sécurité', ar: 'الأمان', es: 'Seguridad' },
  'Users': { fr: 'Utilisateurs', ar: 'المستخدمون', es: 'Usuarios' },
  'Roles': { fr: 'Rôles', ar: 'الأدوار', es: 'Roles' },
  'Permissions': { fr: 'Permissions', ar: 'الصلاحيات', es: 'Permisos' },
  'Notifications': { fr: 'Notifications', ar: 'الإشعارات', es: 'Notificaciones' },
  'Language': { fr: 'Langue', ar: 'اللغة', es: 'Idioma' },
  'Save Changes': { fr: 'Enregistrer les modifications', ar: 'حفظ التغييرات', es: 'Guardar cambios' },

  'Admin Terminal': { fr: 'Terminal admin', ar: 'لوحة الإدارة', es: 'Terminal de administración' },
  'Log Out': { fr: 'Se déconnecter', ar: 'تسجيل الخروج', es: 'Cerrar sesión' },
  'Mark read': { fr: 'Marquer lu', ar: 'تحديد كمقروء', es: 'Marcar leído' },
  'No notifications.': { fr: 'Aucune notification.', ar: 'لا توجد إشعارات.', es: 'No hay notificaciones.' },
  'new': { fr: 'nouveau', ar: 'جديد', es: 'nuevo' },
  ...expandedStaticTextTranslations,
};


const staticWordGlossary: Record<string, StaticTextTranslations> = {
  Add: { fr: 'Ajouter', ar: 'إضافة', es: 'Agregar' },
  New: { fr: 'Nouveau', ar: 'جديد', es: 'Nuevo' },
  Create: { fr: 'Créer', ar: 'إنشاء', es: 'Crear' },
  Edit: { fr: 'Modifier', ar: 'تعديل', es: 'Editar' },
  Update: { fr: 'Mettre à jour', ar: 'تحديث', es: 'Actualizar' },
  Delete: { fr: 'Supprimer', ar: 'حذف', es: 'Eliminar' },
  View: { fr: 'Voir', ar: 'عرض', es: 'Ver' },
  Manage: { fr: 'Gérer', ar: 'إدارة', es: 'Gestionar' },
  Save: { fr: 'Enregistrer', ar: 'حفظ', es: 'Guardar' },
  Cancel: { fr: 'Annuler', ar: 'إلغاء', es: 'Cancelar' },
  Submit: { fr: 'Soumettre', ar: 'إرسال', es: 'Enviar' },
  Search: { fr: 'Rechercher', ar: 'بحث', es: 'Buscar' },
  Filter: { fr: 'Filtrer', ar: 'تصفية', es: 'Filtrar' },
  Clear: { fr: 'Effacer', ar: 'مسح', es: 'Borrar' },
  All: { fr: 'Tous', ar: 'كل', es: 'Todos' },
  Active: { fr: 'Actif', ar: 'نشط', es: 'Activo' },
  Inactive: { fr: 'Inactif', ar: 'غير نشط', es: 'Inactivo' },
  Pending: { fr: 'En attente', ar: 'معلق', es: 'Pendiente' },
  Approved: { fr: 'Approuvé', ar: 'معتمد', es: 'Aprobado' },
  Rejected: { fr: 'Rejeté', ar: 'مرفوض', es: 'Rechazado' },
  Member: { fr: 'Membre', ar: 'عضو', es: 'Miembro' },
  Members: { fr: 'Membres', ar: 'الأعضاء', es: 'Miembros' },
  Plan: { fr: 'Abonnement', ar: 'خطة', es: 'Plan' },
  Plans: { fr: 'Abonnements', ar: 'الخطط', es: 'Planes' },
  Class: { fr: 'Cours', ar: 'حصة', es: 'Clase' },
  Classes: { fr: 'Cours', ar: 'الحصص', es: 'Clases' },
  Employee: { fr: 'Employé', ar: 'موظف', es: 'Empleado' },
  Employees: { fr: 'Employés', ar: 'الموظفون', es: 'Empleados' },
  Staff: { fr: 'Personnel', ar: 'الموظفون', es: 'Personal' },
  Trainer: { fr: 'Coach', ar: 'مدرب', es: 'Entrenador' },
  Trainers: { fr: 'Coachs', ar: 'المدربون', es: 'Entrenadores' },
  Payroll: { fr: 'Paie', ar: 'رواتب', es: 'Nómina' },
  Finance: { fr: 'Finance', ar: 'مالية', es: 'Finanzas' },
  Accounting: { fr: 'Comptabilité', ar: 'محاسبة', es: 'Contabilidad' },
  Warehouse: { fr: 'Entrepôt', ar: 'مستودع', es: 'Almacén' },
  Inventory: { fr: 'Inventaire', ar: 'مخزون', es: 'Inventario' },
  Product: { fr: 'Produit', ar: 'منتج', es: 'Producto' },
  Products: { fr: 'Produits', ar: 'المنتجات', es: 'Productos' },
  Category: { fr: 'Catégorie', ar: 'فئة', es: 'Categoría' },
  Categories: { fr: 'Catégories', ar: 'الفئات', es: 'Categorías' },
  Supplier: { fr: 'Fournisseur', ar: 'مورد', es: 'Proveedor' },
  Suppliers: { fr: 'Fournisseurs', ar: 'الموردون', es: 'Proveedores' },
  Purchase: { fr: 'Achat', ar: 'شراء', es: 'Compra' },
  Order: { fr: 'Commande', ar: 'طلب', es: 'Pedido' },
  Orders: { fr: 'Commandes', ar: 'الطلبات', es: 'Pedidos' },
  Sales: { fr: 'Ventes', ar: 'المبيعات', es: 'Ventas' },
  Stock: { fr: 'Stock', ar: 'مخزون', es: 'Stock' },
  Low: { fr: 'Faible', ar: 'منخفض', es: 'Bajo' },
  High: { fr: 'Élevé', ar: 'مرتفع', es: 'Alto' },
  Status: { fr: 'Statut', ar: 'حالة', es: 'Estado' },
  Date: { fr: 'Date', ar: 'تاريخ', es: 'Fecha' },
  Time: { fr: 'Heure', ar: 'وقت', es: 'Hora' },
  Amount: { fr: 'Montant', ar: 'مبلغ', es: 'Importe' },
  Total: { fr: 'Total', ar: 'إجمالي', es: 'Total' },
  Report: { fr: 'Rapport', ar: 'تقرير', es: 'Informe' },
  Reports: { fr: 'Rapports', ar: 'التقارير', es: 'Informes' },
  Settings: { fr: 'Paramètres', ar: 'إعدادات', es: 'Configuración' },
  Security: { fr: 'Sécurité', ar: 'أمان', es: 'Seguridad' },
  Support: { fr: 'Support', ar: 'دعم', es: 'Soporte' },
  Details: { fr: 'Détails', ar: 'تفاصيل', es: 'Detalles' },
  Summary: { fr: 'Résumé', ar: 'ملخص', es: 'Resumen' },
  History: { fr: 'Historique', ar: 'سجل', es: 'Historial' },
  Current: { fr: 'Actuel', ar: 'حالي', es: 'Actual' },
  Default: { fr: 'Défaut', ar: 'افتراضي', es: 'Predeterminado' },
  Price: { fr: 'Prix', ar: 'سعر', es: 'Precio' },
  Cost: { fr: 'Coût', ar: 'تكلفة', es: 'Costo' },
  Payment: { fr: 'Paiement', ar: 'دفع', es: 'Pago' },
  Method: { fr: 'Méthode', ar: 'طريقة', es: 'Método' },
};

const CONNECTOR_TRANSLATIONS: Record<string, StaticTextTranslations> = {
  '&': { fr: '&', ar: 'و', es: 'y' },
  '/': { fr: '/', ar: '/', es: '/' },
  '-': { fr: '-', ar: '-', es: '-' },
};

function translateByGlossary(locale: Exclude<SupportedLocale, 'en'>, value: string) {
  if (!/^[A-Za-z][A-Za-z0-9 &/().:-]*$/.test(value)) return value;
  const parts = value.split(/(\s+|&|\/|-|:)/);
  let translatedWordCount = 0;
  let untranslatedWordCount = 0;
  const translated = parts.map((part) => {
    if (!part || /^\s+$/.test(part)) return part;
    const connector = CONNECTOR_TRANSLATIONS[part]?.[locale];
    if (connector) return connector;
    if (/^[().:]$/.test(part)) return part;
    const clean = part.replace(/[^A-Za-z]/g, '');
    if (!clean) return part;
    const replacement = staticWordGlossary[clean]?.[locale];
    if (replacement) {
      translatedWordCount += 1;
      return part.replace(clean, replacement);
    }
    if (/^[A-Z0-9]{2,6}$/.test(clean)) return part;
    untranslatedWordCount += 1;
    return part;
  }).join('');
  return translatedWordCount > 0 && untranslatedWordCount === 0 ? translated : value;
}

const textNodeOriginals = new WeakMap<Text, string>();
const attributeOriginals = new WeakMap<Element, Record<string, string>>();
const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'alt'] as const;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA']);

export function translateStaticText(locale: SupportedLocale, value: string): string {
  if (locale === 'en') return value;
  const direct = staticTextTranslations[value]?.[locale];
  return direct || translateByGlossary(locale, value);
}

function preserveOuterWhitespace(original: string, translated: string) {
  const leading = original.match(/^\s*/)?.[0] || '';
  const trailing = original.match(/\s*$/)?.[0] || '';
  return `${leading}${translated}${trailing}`;
}

function shouldSkipNode(node: Node) {
  const parent = node.parentElement;
  if (!parent) return true;
  return Boolean(parent.closest('[data-i18n-opt-out="true"]')) || SKIP_TAGS.has(parent.tagName);
}

function localizeTextNode(node: Text, locale: SupportedLocale) {
  if (shouldSkipNode(node)) return;
  const currentValue = node.nodeValue || '';
  const storedOriginal = textNodeOriginals.get(node);

  // English is the source language. When a node was never translated, avoid
  // writing the same value back into the DOM because that can trigger a
  // MutationObserver characterData loop and blank/freeze the initial login UI.
  if (locale === 'en' && !storedOriginal) return;

  const original = storedOriginal || currentValue;
  const trimmed = original.trim();
  if (!trimmed) return;

  const translated = translateStaticText(locale, trimmed);
  if (translated === trimmed && locale !== 'en') return;

  const nextValue = preserveOuterWhitespace(original, translated);
  if (currentValue === nextValue) return;

  if (!storedOriginal) textNodeOriginals.set(node, original);
  node.nodeValue = nextValue;
}

function localizeAttributes(element: Element, locale: SupportedLocale) {
  if (element.closest('[data-i18n-opt-out="true"]')) return;
  let originals = attributeOriginals.get(element);
  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (!current) continue;

    // Avoid no-op setAttribute calls in the source language. They can create
    // noisy attribute mutations while the unauthenticated login route is
    // mounting.
    if (locale === 'en' && !originals?.[attribute]) continue;

    if (!originals) {
      originals = {};
      attributeOriginals.set(element, originals);
    }
    if (!originals[attribute]) originals[attribute] = current;
    const original = originals[attribute];
    const nextValue = translateStaticText(locale, original);
    if (current === nextValue) continue;
    element.setAttribute(attribute, nextValue);
  }
}

function localizeHead(locale: SupportedLocale) {
  if (typeof document === 'undefined') return;
  const title = document.title || 'PowerGym Management';
  const originalTitle = document.documentElement.dataset.i18nOriginalTitle || title;
  document.documentElement.dataset.i18nOriginalTitle = originalTitle;
  const nextTitle = translateStaticText(locale, originalTitle);
  if (document.title !== nextTitle) document.title = nextTitle;

  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description) {
    const originalDescription = description.dataset.i18nOriginalContent || description.content;
    description.dataset.i18nOriginalContent = originalDescription;
    const nextDescription = translateStaticText(locale, originalDescription);
    if (description.content !== nextDescription) description.content = nextDescription;
  }
}

export function applyStaticTextLocalization(root: ParentNode, locale: SupportedLocale) {
  localizeHead(locale);
  const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = treeWalker.nextNode();
  while (current) {
    localizeTextNode(current as Text, locale);
    current = treeWalker.nextNode();
  }

  const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll('*'))] : Array.from(root.querySelectorAll('*'));
  for (const element of elements) localizeAttributes(element, locale);
}

export function observeStaticTextLocalization(locale: SupportedLocale) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined' || !document.body) {
    return () => undefined;
  }

  const run = () => applyStaticTextLocalization(document.body, locale);
  let scheduledFrame: number | undefined;
  let scheduledTimeout: number | undefined;
  if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
    scheduledFrame = window.requestAnimationFrame(run);
  } else if (typeof globalThis.setTimeout === 'function') {
    scheduledTimeout = globalThis.setTimeout(run, 0) as unknown as number;
  } else {
    run();
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        localizeTextNode(mutation.target as Text, locale);
        continue;
      }
      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        localizeAttributes(mutation.target, locale);
        continue;
      }
      for (const node of Array.from(mutation.addedNodes)) {
        if (node.nodeType === Node.TEXT_NODE) localizeTextNode(node as Text, locale);
        if (node instanceof Element) applyStaticTextLocalization(node, locale);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
  });

  return () => {
    observer.disconnect();
    if (typeof window !== 'undefined' && typeof scheduledFrame === 'number') {
      window.cancelAnimationFrame?.(scheduledFrame);
    }
    if (typeof scheduledTimeout === 'number' && typeof globalThis.clearTimeout === 'function') {
      globalThis.clearTimeout(scheduledTimeout);
    }
  };
}
