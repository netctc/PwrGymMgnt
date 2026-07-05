import type { SupportedLocale } from './config';

type ExpandedStaticTextTranslations = Partial<Record<Exclude<SupportedLocale, 'en'>, string>>;

// Phase 12: expanded static-text coverage generated from the full UI audit.
// Keep product names, e-mail examples, acronyms, and technical identifiers in English when they are intentional UI constants.
const generatedExpandedStaticTextTranslations: Record<string, ExpandedStaticTextTranslations> = {
  "5xx Errors": {
    "fr": "5xx Erreurs",
    "ar": "5xx أخطاء",
    "es": "5xx Errores"
  },
  "API Cache": {
    "fr": "API Cache",
    "ar": "API الذاكرة المؤقتة",
    "es": "API Caché"
  },
  "Absent": {
    "fr": "Absent",
    "ar": "غائب",
    "es": "Ausente"
  },
  "Access Denials": {
    "fr": "Accès Refus",
    "ar": "وصول رفض الوصول",
    "es": "Acceso Denegaciones"
  },
  "Access Denied": {
    "fr": "Accès Refusé",
    "ar": "وصول مرفوض",
    "es": "Acceso Denegado"
  },
  "Access Granted": {
    "fr": "Accès Autorisé",
    "ar": "وصول مسموح",
    "es": "Acceso Concedido"
  },
  "Access eCard": {
    "fr": "Accès e‑carte",
    "ar": "وصول بطاقة إلكترونية",
    "es": "Acceso e‑card"
  },
  "Accessed on date": {
    "fr": "Consulté le date",
    "ar": "تم الوصول في تاريخ",
    "es": "Accedido en fecha"
  },
  "Accessed today": {
    "fr": "Consulté aujourd’hui",
    "ar": "تم الوصول اليوم",
    "es": "Accedido hoy"
  },
  "Accounting & Finance": {
    "fr": "Comptabilité & Finance",
    "ar": "محاسبة & مالية",
    "es": "Contabilidad & Finanzas"
  },
  "Accounting data could not be loaded": {
    "fr": "Les données comptables n’ont pas pu être chargées",
    "ar": "تعذر تحميل بيانات المحاسبة",
    "es": "No se pudieron cargar los datos contables"
  },
  "Action": {
    "fr": "Action",
    "ar": "إجراء",
    "es": "Acción"
  },
  "Action Frequency (Last 7 Days)": {
    "fr": "Action Fréquence (Derniers 7 jours)",
    "ar": "إجراء التكرار (آخر 7 أيام)",
    "es": "Acción Frecuencia (Últimos 7 días)"
  },
  "Active Members": {
    "fr": "Actif Membres",
    "ar": "نشط الأعضاء",
    "es": "Activo Miembros"
  },
  "Active Plans": {
    "fr": "Actif Abonnements",
    "ar": "نشط الخطط",
    "es": "Activo Planes"
  },
  "Active Subscriptions": {
    "fr": "Actif Abonnements",
    "ar": "نشط الاشتراكات",
    "es": "Activo Suscripciones"
  },
  "Active employees": {
    "fr": "Actif employés",
    "ar": "نشط موظفون",
    "es": "Activo empleados"
  },
  "Actor": {
    "fr": "Acteur",
    "ar": "الفاعل",
    "es": "Actor"
  },
  "Add": {
    "fr": "Ajouter",
    "ar": "إضافة",
    "es": "Agregar"
  },
  "Add Employee": {
    "fr": "Ajouter Employé",
    "ar": "إضافة موظف",
    "es": "Agregar Empleado"
  },
  "Add Loan": {
    "fr": "Ajouter Prêt",
    "ar": "إضافة قرض",
    "es": "Agregar Préstamo"
  },
  "Add Product": {
    "fr": "Ajouter Produit",
    "ar": "إضافة منتج",
    "es": "Agregar Producto"
  },
  "Add Rental": {
    "fr": "Ajouter Location",
    "ar": "إضافة إيجار",
    "es": "Agregar Alquiler"
  },
  "Add Transaction": {
    "fr": "Ajouter Transaction",
    "ar": "إضافة معاملة",
    "es": "Agregar Transacción"
  },
  "Add any background or employee notes...": {
    "fr": "Ajoutez des informations contextuelles ou des notes employé...",
    "ar": "أضف أي ملاحظات أو معلومات خلفية عن الموظف...",
    "es": "Agregue antecedentes o notas del empleado..."
  },
  "Add employee": {
    "fr": "Ajouter employé",
    "ar": "إضافة موظف",
    "es": "Agregar empleado"
  },
  "Additional deduction per employee": {
    "fr": "Supplémentaire retenue par employé",
    "ar": "إضافي اقتطاع لكل موظف",
    "es": "Adicional deducción por empleado"
  },
  "Address": {
    "fr": "Adresse",
    "ar": "العنوان",
    "es": "Dirección"
  },
  "Advanced": {
    "fr": "Avancé",
    "ar": "متقدم",
    "es": "Avanzado"
  },
  "Affected Rows": {
    "fr": "Affectées Lignes",
    "ar": "متأثرة صفوف",
    "es": "Afectadas Filas"
  },
  "All": {
    "fr": "Tous",
    "ar": "كل",
    "es": "Todos"
  },
  "All Logs": {
    "fr": "Tous Journaux",
    "ar": "كل السجلات",
    "es": "Todos Registros"
  },
  "All Roles": {
    "fr": "Tous Rôles",
    "ar": "كل الأدوار",
    "es": "Todos Roles"
  },
  "All access dates": {
    "fr": "Tous Accès dates",
    "ar": "كل وصول dates",
    "es": "Todos Acceso dates"
  },
  "All categories": {
    "fr": "Tous catégories",
    "ar": "كل الفئات",
    "es": "Todos categorías"
  },
  "All statuses": {
    "fr": "Tous statuts",
    "ar": "كل الحالات",
    "es": "Todos estados"
  },
  "All trainers": {
    "fr": "Tous coachs",
    "ar": "كل المدربون",
    "es": "Todos entrenadores"
  },
  "Allowances": {
    "fr": "Indemnités",
    "ar": "البدلات",
    "es": "Asignaciones"
  },
  "Analytics": {
    "fr": "Analytique",
    "ar": "التحليلات",
    "es": "Analítica"
  },
  "Apply": {
    "fr": "Appliquer",
    "ar": "تطبيق",
    "es": "Aplicar"
  },
  "Apply Promo": {
    "fr": "Appliquer Promo",
    "ar": "تطبيق ترويجي",
    "es": "Aplicar Promoción"
  },
  "Approved": {
    "fr": "Approuvé",
    "ar": "معتمد",
    "es": "Aprobado"
  },
  "Archive": {
    "fr": "Archiver",
    "ar": "أرشفة",
    "es": "Archivar"
  },
  "Archive member?": {
    "fr": "Archiver member?",
    "ar": "أرشفة member?",
    "es": "Archivar member?"
  },
  "Archived": {
    "fr": "Archivés",
    "ar": "مؤرشف",
    "es": "Archivados"
  },
  "Archived Members": {
    "fr": "Archivés Membres",
    "ar": "مؤرشف الأعضاء",
    "es": "Archivados Miembros"
  },
  "Assign Shift": {
    "fr": "Affecter Shift",
    "ar": "تعيين مناوبة",
    "es": "Asignar Turno"
  },
  "Attendance capture": {
    "fr": "Présence capture",
    "ar": "الحضور capture",
    "es": "Asistencia capture"
  },
  "Audit Logs": {
    "fr": "Audit Journaux",
    "ar": "التدقيق السجلات",
    "es": "Auditoría Registros"
  },
  "Auditable delivery status without exposing reset token hashes or raw tokens.": {
    "fr": "Statut de livraison auditable sans exposer les hachages de jetons de réinitialisation ni les jetons bruts.",
    "ar": "حالة تسليم قابلة للتدقيق دون كشف تجزئات رموز إعادة التعيين أو الرموز الأصلية.",
    "es": "Estado de entrega auditable sin exponer hashes de tokens de restablecimiento ni tokens sin procesar."
  },
  "Auto-print receipt": {
    "fr": "Auto-impression reçu",
    "ar": "تلقائي-طباعة إيصال",
    "es": "Auto-imprimir recibo"
  },
  "Average base salary": {
    "fr": "Moyenne base salaire",
    "ar": "متوسط أساسي راتب",
    "es": "Promedio base salario"
  },
  "Avg API": {
    "fr": "Moy. API",
    "ar": "متوسط API",
    "es": "Prom. API"
  },
  "Avg Duration": {
    "fr": "Moy. Durée",
    "ar": "متوسط المدة",
    "es": "Prom. Duración"
  },
  "Avg. Fulfillment Time": {
    "fr": "Moy.. exécution Heure",
    "ar": "متوسط. التنفيذ الوقت",
    "es": "Prom.. cumplimiento Hora"
  },
  "Back to Login": {
    "fr": "Retour À Connexion",
    "ar": "عودة إلى تسجيل الدخول",
    "es": "Volver Hasta Inicio de sesión"
  },
  "Backend-connected member records, subscription renewals, invoices, and QR e-card generation.": {
    "fr": "Fiches membres connectées au backend, renouvellements d’abonnements, factures et génération de cartes e‑QR.",
    "ar": "سجلات أعضاء متصلة بالخادم، وتجديدات اشتراكات، وفواتير، وإنشاء بطاقات QR إلكترونية.",
    "es": "Registros de miembros conectados al backend, renovaciones de suscripción, facturas y generación de e‑cards QR."
  },
  "Backend-connected subscription tiers used for member renewals and invoice generation.": {
    "fr": "Niveaux d’abonnement connectés au backend utilisés pour les renouvellements membres et la génération des factures.",
    "ar": "مستويات اشتراك متصلة بالخادم تُستخدم لتجديدات الأعضاء وإنشاء الفواتير.",
    "es": "Niveles de suscripción conectados al backend usados para renovaciones de miembros y generación de facturas."
  },
  "Background Image": {
    "fr": "Arrière-plan Image",
    "ar": "الخلفية صورة",
    "es": "Fondo Imagen"
  },
  "Backup File Name": {
    "fr": "Sauvegarde Fichier Nom",
    "ar": "نسخة احتياطية ملف الاسم",
    "es": "Copia de seguridad Archivo Nombre"
  },
  "Bank Transfer": {
    "fr": "Banque Virement",
    "ar": "بنك تحويل",
    "es": "Banco Transferencia"
  },
  "Barcode": {
    "fr": "Code-barres",
    "ar": "باركود",
    "es": "Código de barras"
  },
  "Barcode Scanner": {
    "fr": "Code-barres Scanner",
    "ar": "باركود ماسح",
    "es": "Código de barras Escáner"
  },
  "Base": {
    "fr": "Base",
    "ar": "أساس",
    "es": "Base"
  },
  "Base salary": {
    "fr": "Base salaire",
    "ar": "أساس راتب",
    "es": "Base salario"
  },
  "Basic information for your gym software.": {
    "fr": "Informations de base pour votre logiciel de salle de sport.",
    "ar": "معلومات أساسية لبرنامج النادي الرياضي.",
    "es": "Información básica para su software de gimnasio."
  },
  "Beginner": {
    "fr": "Débutant",
    "ar": "مبتدئ",
    "es": "Principiante"
  },
  "Bonus": {
    "fr": "Prime",
    "ar": "مكافأة",
    "es": "Bono"
  },
  "Book": {
    "fr": "Réserver",
    "ar": "حجز",
    "es": "Reservar"
  },
  "Book Private Classes": {
    "fr": "Réserver Privé Cours",
    "ar": "حجز خاص الحصص",
    "es": "Reservar Privado Clases"
  },
  "Book member": {
    "fr": "Réserver member",
    "ar": "حجز member",
    "es": "Reservar member"
  },
  "Branch": {
    "fr": "Branche",
    "ar": "فرع",
    "es": "Sucursal"
  },
  "Bulk Assign": {
    "fr": "En masse Affecter",
    "ar": "جماعي تعيين",
    "es": "Masivo Asignar"
  },
  "Bulk Assign Shifts": {
    "fr": "En masse Affecter Shifts",
    "ar": "جماعي تعيين المناوبات",
    "es": "Masivo Asignar Turnos"
  },
  "Calculated signals based on server errors, denied access, slow endpoints, and password reset delivery failures.": {
    "fr": "Signaux calculés à partir des erreurs serveur, accès refusés, endpoints lents et échecs de livraison de réinitialisation du mot de passe.",
    "ar": "مؤشرات محسوبة بناءً على أخطاء الخادم، ورفض الوصول، وبطء نقاط النهاية، وفشل تسليم إعادة تعيين كلمة المرور.",
    "es": "Señales calculadas a partir de errores del servidor, accesos denegados, endpoints lentos y fallos de entrega de restablecimiento de contraseña."
  },
  "Card": {
    "fr": "Carte",
    "ar": "بطاقة",
    "es": "Tarjeta"
  },
  "Cash": {
    "fr": "Espèces",
    "ar": "نقدًا",
    "es": "Efectivo"
  },
  "Category Breakdown": {
    "fr": "Catégorie Répartition",
    "ar": "الفئة تفصيل",
    "es": "Categoría Desglose"
  },
  "Category fallback": {
    "fr": "Catégorie secours",
    "ar": "الفئة بديل",
    "es": "Categoría respaldo"
  },
  "Channel": {
    "fr": "Canal",
    "ar": "القناة",
    "es": "Canal"
  },
  "Chat on WhatsApp": {
    "fr": "Chat le WhatsApp",
    "ar": "محادثة في WhatsApp",
    "es": "Chat en WhatsApp"
  },
  "Check": {
    "fr": "Vérifier",
    "ar": "فحص",
    "es": "Verificar"
  },
  "Check your session, API connectivity, and database migrations before retrying.": {
    "fr": "Vérifiez votre session, la connectivité API et les migrations de base de données avant de réessayer.",
    "ar": "تحقق من الجلسة واتصال API وترحيلات قاعدة البيانات قبل إعادة المحاولة.",
    "es": "Verifique su sesión, conectividad API y migraciones de base de datos antes de reintentar."
  },
  "Checking...": {
    "fr": "Vérification...",
    "ar": "جار الفحص...",
    "es": "Verificando..."
  },
  "Checks": {
    "fr": "Contrôles",
    "ar": "الفحوصات",
    "es": "Controles"
  },
  "Class screen PDFs": {
    "fr": "Cours screen PDFs",
    "ar": "حصة screen PDFs",
    "es": "Clase screen PDFs"
  },
  "Clear": {
    "fr": "Effacer",
    "ar": "مسح",
    "es": "Borrar"
  },
  "Clear Cache": {
    "fr": "Effacer Cache",
    "ar": "مسح الذاكرة المؤقتة",
    "es": "Borrar Caché"
  },
  "Client": {
    "fr": "Client",
    "ar": "عميل",
    "es": "Cliente"
  },
  "Client (Revoke access)": {
    "fr": "Client (Révoquer Accès)",
    "ar": "عميل (إلغاء وصول)",
    "es": "Cliente (Revocar Acceso)"
  },
  "Combined Active Price": {
    "fr": "Combiné Actif Prix",
    "ar": "مجمّع نشط السعر",
    "es": "Combinado Activo Precio"
  },
  "Combined security, performance, membership, and finance KPIs for the selected range.": {
    "fr": "Indicateurs combinés de sécurité, performance, adhésions et finance pour la période sélectionnée.",
    "ar": "مؤشرات مجمعة للأمان والأداء والعضوية والمالية للفترة المحددة.",
    "es": "KPIs combinados de seguridad, rendimiento, membresía y finanzas para el rango seleccionado."
  },
  "Configure global application parameters and view system logs.": {
    "fr": "Configurez les paramètres globaux de l’application et consultez les journaux système.",
    "ar": "اضبط معلمات التطبيق العامة واعرض سجلات النظام.",
    "es": "Configure parámetros globales de la aplicación y consulte los registros del sistema."
  },
  "Confirm you are signed in and MySQL is configured, then run npm run db:migrate.": {
    "fr": "Confirmez que vous êtes connecté et que MySQL est configuré, puis exécutez npm run db:migrate.",
    "ar": "تأكد من تسجيل الدخول وأن MySQL مهيأ، ثم شغّل npm run db:migrate.",
    "es": "Confirme que inició sesión y que MySQL está configurado; luego ejecute npm run db:migrate."
  },
  "Consolidated report filters": {
    "fr": "Consolidated Rapport filters",
    "ar": "Consolidated تقرير filters",
    "es": "Consolidated Reporte filters"
  },
  "Contact": {
    "fr": "Contact",
    "ar": "تواصل",
    "es": "Contacto"
  },
  "Contractor": {
    "fr": "Contractuel",
    "ar": "متعاقد",
    "es": "Contratista"
  },
  "Create Class": {
    "fr": "Créer Cours",
    "ar": "إنشاء حصة",
    "es": "Crear Clase"
  },
  "Create Employee": {
    "fr": "Créer Employé",
    "ar": "إنشاء موظف",
    "es": "Crear Empleado"
  },
  "Create Employee Profile": {
    "fr": "Créer Employé Profil",
    "ar": "إنشاء موظف الملف",
    "es": "Crear Empleado Perfil"
  },
  "Create PO": {
    "fr": "Créer PO",
    "ar": "إنشاء PO",
    "es": "Crear PO"
  },
  "Create Shifts": {
    "fr": "Créer Shifts",
    "ar": "إنشاء المناوبات",
    "es": "Crear Turnos"
  },
  "Create Supplier": {
    "fr": "Créer Fournisseur",
    "ar": "إنشاء مورد",
    "es": "Crear Proveedor"
  },
  "Create Support Ticket": {
    "fr": "Créer Support Ticket",
    "ar": "إنشاء دعم تذكرة",
    "es": "Crear Soporte Ticket"
  },
  "Create a PO or adjust the filters to see supplier replenishment cycles.": {
    "fr": "Créez un bon de commande ou ajustez les filtres pour voir les cycles de réapprovisionnement fournisseur.",
    "ar": "أنشئ أمر شراء أو عدّل الفلاتر لرؤية دورات إعادة التزويد من المورد.",
    "es": "Cree una orden de compra o ajuste los filtros para ver ciclos de reposición del proveedor."
  },
  "Create a monthly payroll run from active employees, salary rules, allowances, deductions, and attendance.": {
    "fr": "Créez une paie mensuelle à partir des employés actifs, règles salariales, indemnités, retenues et présences.",
    "ar": "أنشئ دورة رواتب شهرية من الموظفين النشطين وقواعد الرواتب والبدلات والاقتطاعات والحضور.",
    "es": "Cree una corrida mensual de nómina desde empleados activos, reglas salariales, asignaciones, deducciones y asistencia."
  },
  "Create plans once, then reuse them from member renewals.": {
    "fr": "Créez les abonnements une fois, puis réutilisez-les lors des renouvellements membres.",
    "ar": "أنشئ الخطط مرة واحدة ثم أعد استخدامها في تجديدات الأعضاء.",
    "es": "Cree planes una vez y reutilícelos en renovaciones de miembros."
  },
  "Create the first subscription tier before selling or renewing memberships.": {
    "fr": "Créez le premier niveau d’abonnement avant de vendre ou renouveler des adhésions.",
    "ar": "أنشئ أول مستوى اشتراك قبل بيع العضويات أو تجديدها.",
    "es": "Cree el primer nivel de suscripción antes de vender o renovar membresías."
  },
  "Created": {
    "fr": "Créé",
    "ar": "تم الإنشاء",
    "es": "Creado"
  },
  "Crossfit": {
    "fr": "Crossfit",
    "ar": "كروسفت",
    "es": "Crossfit"
  },
  "Currency": {
    "fr": "Devise",
    "ar": "العملة",
    "es": "Moneda"
  },
  "Current Expiry": {
    "fr": "Actuel Expiration",
    "ar": "حالي الانتهاء",
    "es": "Actual Vencimiento"
  },
  "Current Plan": {
    "fr": "Actuel Abonnement",
    "ar": "حالي خطة",
    "es": "Actual Plan"
  },
  "Current Plan:": {
    "fr": "Actuel Abonnement:",
    "ar": "حالي خطة:",
    "es": "Actual Plan:"
  },
  "Current background preview": {
    "fr": "Actuel Arrière-plan aperçu",
    "ar": "حالي الخلفية معاينة",
    "es": "Actual Fondo vista previa"
  },
  "Customize the PDF e-card generated from the Members section.": {
    "fr": "Personnalisez la carte e‑PDF générée depuis la section Membres.",
    "ar": "خصّص بطاقة PDF الإلكترونية التي يتم إنشاؤها من قسم الأعضاء.",
    "es": "Personalice la e‑card PDF generada desde la sección Miembros."
  },
  "Data Integrity Center": {
    "fr": "Données Intégrité Centre",
    "ar": "البيانات السلامة مركز",
    "es": "Datos Integridad Centro"
  },
  "Database Backups": {
    "fr": "Base de données Backups",
    "ar": "قاعدة البيانات Backups",
    "es": "Base de datos Backups"
  },
  "Database Maintenance": {
    "fr": "Base de données Maintenance",
    "ar": "قاعدة البيانات الصيانة",
    "es": "Base de datos Mantenimiento"
  },
  "Database Status": {
    "fr": "Base de données Statut",
    "ar": "قاعدة البيانات الحالة",
    "es": "Base de datos Estado"
  },
  "Date / Time": {
    "fr": "Date / Heure",
    "ar": "Date / الوقت",
    "es": "Date / Hora"
  },
  "Date Created": {
    "fr": "Date Créé",
    "ar": "Date تم الإنشاء",
    "es": "Date Creado"
  },
  "Date Issued": {
    "fr": "Date Émis",
    "ar": "Date صادر",
    "es": "Date Emitido"
  },
  "Days of Week": {
    "fr": "jours of Semaine",
    "ar": "أيام of الأسبوع",
    "es": "días of Semana"
  },
  "Days of the Week": {
    "fr": "jours of the Semaine",
    "ar": "أيام of the الأسبوع",
    "es": "días of the Semana"
  },
  "Deductions": {
    "fr": "Retenues",
    "ar": "الاقتطاعات",
    "es": "Deducciones"
  },
  "Default bonus per employee": {
    "fr": "Défaut Prime par employé",
    "ar": "افتراضي مكافأة لكل موظف",
    "es": "Predeterminado Bono por empleado"
  },
  "Delete Profile": {
    "fr": "Supprimer Profil",
    "ar": "حذف الملف",
    "es": "Eliminar Perfil"
  },
  "Delete transaction?": {
    "fr": "Supprimer Transaction?",
    "ar": "حذف معاملة?",
    "es": "Eliminar Transacción?"
  },
  "Delivery schedule": {
    "fr": "Livraison planning",
    "ar": "التسليم الجدولة",
    "es": "Entrega programación"
  },
  "Denied": {
    "fr": "Refusé",
    "ar": "مرفوض",
    "es": "Denegado"
  },
  "Details": {
    "fr": "Détails",
    "ar": "تفاصيل",
    "es": "Detalles"
  },
  "Digital Wallet": {
    "fr": "Numérique Portefeuille",
    "ar": "رقمي محفظة",
    "es": "Digital Billetera"
  },
  "Divisions within your gym.": {
    "fr": "Divisions au sein de votre salle de sport.",
    "ar": "الأقسام داخل النادي الرياضي.",
    "es": "Divisiones dentro de su gimnasio."
  },
  "Download Full Report": {
    "fr": "Télécharger Complet Rapport",
    "ar": "تنزيل كامل تقرير",
    "es": "Descargar Completo Reporte"
  },
  "Download PDF": {
    "fr": "Télécharger PDF",
    "ar": "تنزيل PDF",
    "es": "Descargar PDF"
  },
  "Download member, subscription and collection PDFs using the same status/search context as this screen.": {
    "fr": "Téléchargez les PDF des membres, abonnements et encaissements en utilisant le même contexte de statut/recherche que cet écran.",
    "ar": "نزّل ملفات PDF للأعضاء والاشتراكات والتحصيل باستخدام نفس سياق الحالة/البحث في هذه الشاشة.",
    "es": "Descargue PDFs de miembros, suscripciones y cobros usando el mismo contexto de estado/búsqueda de esta pantalla."
  },
  "Download receipt PDF": {
    "fr": "Télécharger reçu PDF",
    "ar": "تنزيل إيصال PDF",
    "es": "Descargar recibo PDF"
  },
  "Download support ticket and notification reports from this screen.": {
    "fr": "Téléchargez les rapports de tickets de support et de notifications depuis cet écran.",
    "ar": "نزّل تقارير تذاكر الدعم والإشعارات من هذه الشاشة.",
    "es": "Descargue reportes de tickets de soporte y notificaciones desde esta pantalla."
  },
  "Download the finance transaction PDF using the active ledger filters.": {
    "fr": "Téléchargez le PDF des transactions financières avec les filtres de grand livre actifs.",
    "ar": "نزّل ملف PDF للمعاملات المالية باستخدام فلاتر دفتر الأستاذ النشطة.",
    "es": "Descargue el PDF de transacciones financieras usando los filtros activos del libro mayor."
  },
  "Download the most recent subscription receipt/invoice for this member.": {
    "fr": "Téléchargez le reçu ou la facture d’abonnement le plus récent pour ce membre.",
    "ar": "نزّل أحدث إيصال/فاتورة اشتراك لهذا العضو.",
    "es": "Descargue el recibo/factura de suscripción más reciente de este miembro."
  },
  "Dry-run": {
    "fr": "simulation-cycle",
    "ar": "محاكاة-دورة",
    "es": "simulación-corrida"
  },
  "Due Day": {
    "fr": "Échéance Jour",
    "ar": "مستحق يوم",
    "es": "Vencimiento Día"
  },
  "Duration Days": {
    "fr": "Durée jours",
    "ar": "المدة أيام",
    "es": "Duración días"
  },
  "Edit Employee Profile": {
    "fr": "Modifier Employé Profil",
    "ar": "تعديل موظف الملف",
    "es": "Editar Empleado Perfil"
  },
  "Edit Profile": {
    "fr": "Modifier Profil",
    "ar": "تعديل الملف",
    "es": "Editar Perfil"
  },
  "Email PDF": {
    "fr": "E-mail PDF",
    "ar": "البريد الإلكتروني PDF",
    "es": "Correo PDF"
  },
  "Employee": {
    "fr": "Employé",
    "ar": "موظف",
    "es": "Empleado"
  },
  "Employee code": {
    "fr": "Employé code",
    "ar": "موظف code",
    "es": "Empleado code"
  },
  "Employee directory": {
    "fr": "Employé directory",
    "ar": "موظف directory",
    "es": "Empleado directory"
  },
  "End": {
    "fr": "Fin",
    "ar": "النهاية",
    "es": "Fin"
  },
  "End Date": {
    "fr": "Fin Date",
    "ar": "النهاية Date",
    "es": "Fin Date"
  },
  "End Date is calculated automatically from the renewal start date plus the selected plan duration.": {
    "fr": "La date de fin est calculée automatiquement à partir de la date de début de renouvellement et de la durée de l’abonnement sélectionné.",
    "ar": "يتم حساب تاريخ الانتهاء تلقائيًا من تاريخ بدء التجديد مضافًا إليه مدة الخطة المحددة.",
    "es": "La fecha de finalización se calcula automáticamente desde la fecha de inicio de renovación más la duración del plan seleccionado."
  },
  "Enter your email. If an admin account exists, a reset token or link will be delivered through the configured channel.": {
    "fr": "Saisissez votre e-mail. Si un compte administrateur existe, un jeton ou lien de réinitialisation sera envoyé via le canal configuré.",
    "ar": "أدخل بريدك الإلكتروني. إذا كان حساب المدير موجودًا، سيتم إرسال رمز أو رابط إعادة التعيين عبر القناة المهيأة.",
    "es": "Ingrese su correo. Si existe una cuenta administradora, se enviará un token o enlace de restablecimiento por el canal configurado."
  },
  "Entire Week": {
    "fr": "Toute Semaine",
    "ar": "كامل الأسبوع",
    "es": "Toda Semana"
  },
  "Error": {
    "fr": "Erreur",
    "ar": "خطأ",
    "es": "Error"
  },
  "Error Logs": {
    "fr": "Erreur Journaux",
    "ar": "خطأ السجلات",
    "es": "Error Registros"
  },
  "Exact amount": {
    "fr": "Exact Montant",
    "ar": "Exact المبلغ",
    "es": "Exact Importe"
  },
  "Excel": {
    "fr": "Excel",
    "ar": "إكسل",
    "es": "Excel"
  },
  "Expected date": {
    "fr": "Prévu date",
    "ar": "متوقع تاريخ",
    "es": "Esperado fecha"
  },
  "Expenses": {
    "fr": "Dépenses",
    "ar": "المصروفات",
    "es": "Gastos"
  },
  "Expiry": {
    "fr": "Expiration",
    "ar": "الانتهاء",
    "es": "Vencimiento"
  },
  "Expiry Date": {
    "fr": "Expiration Date",
    "ar": "الانتهاء Date",
    "es": "Vencimiento Date"
  },
  "Expiry Date is locked and derived from the member's active subscription.": {
    "fr": "La date d’expiration est verrouillée et dérivée de l’abonnement actif du membre.",
    "ar": "تاريخ الانتهاء مقفل ومشتق من الاشتراك النشط للعضو.",
    "es": "La fecha de vencimiento está bloqueada y deriva de la suscripción activa del miembro."
  },
  "Expiry date": {
    "fr": "Expiration date",
    "ar": "الانتهاء تاريخ",
    "es": "Vencimiento fecha"
  },
  "Expiry:": {
    "fr": "Expiration:",
    "ar": "الانتهاء:",
    "es": "Vencimiento:"
  },
  "Export": {
    "fr": "Exporter",
    "ar": "تصدير",
    "es": "Exportar"
  },
  "Export CSV": {
    "fr": "Exporter CSV",
    "ar": "تصدير CSV",
    "es": "Exportar CSV"
  },
  "Export security audit events with the current audit search context.": {
    "fr": "Exportez les événements d’audit de sécurité avec le contexte de recherche actuel.",
    "ar": "صدّر أحداث تدقيق الأمان باستخدام سياق البحث الحالي.",
    "es": "Exporte eventos de auditoría de seguridad con el contexto de búsqueda actual."
  },
  "Export subscription validity and collection reports from the plan management screen.": {
    "fr": "Exportez les rapports de validité d’abonnement et d’encaissement depuis l’écran de gestion des abonnements.",
    "ar": "صدّر تقارير صلاحية الاشتراك والتحصيل من شاشة إدارة الخطط.",
    "es": "Exporte reportes de validez de suscripciones y cobros desde la pantalla de gestión de planes."
  },
  "Failed": {
    "fr": "Échec",
    "ar": "فشل",
    "es": "Fallido"
  },
  "Failing": {
    "fr": "En échec",
    "ar": "متعثر",
    "es": "Con fallos"
  },
  "File Size": {
    "fr": "Fichier Size",
    "ar": "ملف Size",
    "es": "Archivo Size"
  },
  "Filter by day": {
    "fr": "Filtrer by Jour",
    "ar": "تصفية by يوم",
    "es": "Filtrar by Día"
  },
  "Finance screen PDFs": {
    "fr": "Finance screen PDFs",
    "ar": "مالية screen PDFs",
    "es": "Finanzas screen PDFs"
  },
  "First Name": {
    "fr": "Prénom Nom",
    "ar": "الأول الاسم",
    "es": "Nombre Nombre"
  },
  "First name": {
    "fr": "Prénom Nom",
    "ar": "الأول الاسم",
    "es": "Nombre Nombre"
  },
  "Forgot password?": {
    "fr": "Mot de passe oublié Mot de passe?",
    "ar": "نسيت كلمة المرور كلمة المرور?",
    "es": "Olvidó contraseña Contraseña?"
  },
  "From Date": {
    "fr": "De Date",
    "ar": "من Date",
    "es": "Desde Date"
  },
  "Full address": {
    "fr": "Complet Adresse",
    "ar": "كامل العنوان",
    "es": "Completo Dirección"
  },
  "Full-time": {
    "fr": "Complet-Heure",
    "ar": "كامل-الوقت",
    "es": "Completo-Hora"
  },
  "General": {
    "fr": "Général",
    "ar": "عام",
    "es": "General"
  },
  "General Configuration": {
    "fr": "Général Configuration",
    "ar": "عام Configuration",
    "es": "General Configuration"
  },
  "Generate a secure QR token and PDF e-card for scanner validation.": {
    "fr": "Générez un jeton QR sécurisé et une carte e‑PDF pour validation par scanner.",
    "ar": "أنشئ رمز QR آمنًا وبطاقة PDF إلكترونية للتحقق بالماسح.",
    "es": "Genere un token QR seguro y una e‑card PDF para validación con escáner."
  },
  "Generate backend PDFs with role-aware filters for each operational screen.": {
    "fr": "Générez des PDF backend avec filtres selon les rôles pour chaque écran opérationnel.",
    "ar": "أنشئ ملفات PDF من الخادم بفلاتر تراعي الدور لكل شاشة تشغيلية.",
    "es": "Genere PDFs backend con filtros según rol para cada pantalla operativa."
  },
  "Generate class sessions and booking PDFs for the selected trainer and period.": {
    "fr": "Générez les PDF des sessions de cours et réservations pour le coach et la période sélectionnés.",
    "ar": "أنشئ ملفات PDF لجلسات الحصص والحجوزات للمدرب والفترة المحددين.",
    "es": "Genere PDFs de sesiones de clase y reservas para el entrenador y período seleccionados."
  },
  "Generate employee profile and payroll reports directly from HR filters.": {
    "fr": "Générez les rapports de profil employé et de paie directement depuis les filtres RH.",
    "ar": "أنشئ تقارير ملف الموظف والرواتب مباشرة من فلاتر الموارد البشرية.",
    "es": "Genere reportes de perfil de empleado y nómina directamente desde filtros de RR. HH."
  },
  "Generate payroll": {
    "fr": "Générer paie",
    "ar": "إنشاء الرواتب",
    "es": "Generar nómina"
  },
  "Generate private/PT session PDFs for the selected trainer and period.": {
    "fr": "Générez les PDF des sessions privées/PT pour le coach et la période sélectionnés.",
    "ar": "أنشئ ملفات PDF لجلسات التدريب الخاص للمدرب والفترة المحددين.",
    "es": "Genere PDFs de sesiones privadas/PT para el entrenador y período seleccionados."
  },
  "Generate staff-user reports using role-aware access from the staff screen.": {
    "fr": "Générez des rapports du personnel avec accès selon les rôles depuis l’écran du personnel.",
    "ar": "أنشئ تقارير مستخدمي الموظفين باستخدام وصول يراعي الدور من شاشة الموظفين.",
    "es": "Genere reportes de usuarios de personal con acceso por rol desde la pantalla de personal."
  },
  "Gym Name": {
    "fr": "Salle Nom",
    "ar": "النادي الاسم",
    "es": "Gimnasio Nombre"
  },
  "HR and payroll PDFs": {
    "fr": "HR and paie PDFs",
    "ar": "HR and الرواتب PDFs",
    "es": "HR and nómina PDFs"
  },
  "Healthy": {
    "fr": "Sain",
    "ar": "سليم",
    "es": "Saludable"
  },
  "Held Orders": {
    "fr": "En attente Commandes",
    "ar": "معلقة الطلبات",
    "es": "Retenidos Pedidos"
  },
  "Here's what's happening today.": {
    "fr": "Here's what's happening aujourd’hui.",
    "ar": "Here's what's happening اليوم.",
    "es": "Here's what's happening hoy."
  },
  "Hire date": {
    "fr": "Embauche date",
    "ar": "التوظيف تاريخ",
    "es": "Contratación fecha"
  },
  "Hold Order": {
    "fr": "Bloquer Commande",
    "ar": "تعليق طلب",
    "es": "Retener Pedido"
  },
  "Hours": {
    "fr": "Heures",
    "ar": "ساعات",
    "es": "Horas"
  },
  "Housing allowance": {
    "fr": "Logement indemnité",
    "ar": "السكن بدل",
    "es": "Vivienda asignación"
  },
  "Image URL or JPEG/PNG data URL": {
    "fr": "URL d’image ou URL de données JPEG/PNG",
    "ar": "رابط صورة أو رابط بيانات JPEG/PNG",
    "es": "URL de imagen o URL de datos JPEG/PNG"
  },
  "Import CSV": {
    "fr": "Importer CSV",
    "ar": "استيراد CSV",
    "es": "Importar CSV"
  },
  "Income, expenses, payroll postings, loans, rentals, budgets, and exports.": {
    "fr": "Revenus, dépenses, écritures de paie, prêts, locations, budgets et exports.",
    "ar": "الإيرادات والمصروفات وترحيلات الرواتب والقروض والإيجارات والميزانيات والتصديرات.",
    "es": "Ingresos, gastos, contabilizaciones de nómina, préstamos, alquileres, presupuestos y exportaciones."
  },
  "Inspect": {
    "fr": "Inspecter",
    "ar": "فحص",
    "es": "Inspeccionar"
  },
  "Insurance deduction": {
    "fr": "Assurance retenue",
    "ar": "التأمين اقتطاع",
    "es": "Seguro deducción"
  },
  "Interest": {
    "fr": "Intérêt",
    "ar": "الفائدة",
    "es": "Interés"
  },
  "Interest %": {
    "fr": "Intérêt %",
    "ar": "الفائدة %",
    "es": "Interés %"
  },
  "Intermediate": {
    "fr": "Intermédiaire",
    "ar": "متوسط",
    "es": "Intermedio"
  },
  "Invalid amount filter": {
    "fr": "Invalide Montant filtre",
    "ar": "غير صالح المبلغ فلتر",
    "es": "Inválido Importe filtro"
  },
  "Invalid filter range": {
    "fr": "Invalide filtre plage",
    "ar": "غير صالح فلتر نطاق",
    "es": "Inválido filtro rango"
  },
  "Inventory Valuation": {
    "fr": "Inventaire Valorisation",
    "ar": "المخزون التقييم",
    "es": "Inventario Valoración"
  },
  "Invoice": {
    "fr": "Facture",
    "ar": "فاتورة",
    "es": "Factura"
  },
  "Invoiced": {
    "fr": "Facturé",
    "ar": "مفوتر",
    "es": "Facturado"
  },
  "Invoices": {
    "fr": "Factures",
    "ar": "الفواتير",
    "es": "Facturas"
  },
  "JPEG/PNG, max 1.5 MB. Upload replaces the current image.": {
    "fr": "JPEG/PNG, 1,5 Mo max. L’import remplace l’image actuelle.",
    "ar": "JPEG/PNG بحد أقصى 1.5 ميغابايت. الرفع يستبدل الصورة الحالية.",
    "es": "JPEG/PNG, máximo 1,5 MB. La carga reemplaza la imagen actual."
  },
  "Job title": {
    "fr": "Poste titre",
    "ar": "وظيفة عنوان",
    "es": "Puesto título"
  },
  "Join Date": {
    "fr": "Adhésion Date",
    "ar": "الانضمام Date",
    "es": "Alta Date"
  },
  "Joined": {
    "fr": "Inscrit",
    "ar": "انضم",
    "es": "Alta"
  },
  "Joined:": {
    "fr": "Inscrit:",
    "ar": "انضم:",
    "es": "Alta:"
  },
  "Landlord Info": {
    "fr": "Bailleur Infos",
    "ar": "المالك معلومات",
    "es": "Arrendador Info"
  },
  "Last Access": {
    "fr": "Derniers Accès",
    "ar": "آخر وصول",
    "es": "Últimos Acceso"
  },
  "Last Access:": {
    "fr": "Derniers Accès:",
    "ar": "آخر وصول:",
    "es": "Últimos Acceso:"
  },
  "Last Name": {
    "fr": "Derniers Nom",
    "ar": "آخر الاسم",
    "es": "Últimos Nombre"
  },
  "Last Receipt": {
    "fr": "Derniers Reçu",
    "ar": "آخر إيصال",
    "es": "Últimos Recibo"
  },
  "Last name": {
    "fr": "Derniers Nom",
    "ar": "آخر الاسم",
    "es": "Últimos Nombre"
  },
  "Last scan failed": {
    "fr": "Derniers Scanner Échec",
    "ar": "آخر مسح فشل",
    "es": "Últimos Escanear Fallido"
  },
  "Leave blank to keep current": {
    "fr": "Laissez vide pour conserver la valeur actuelle",
    "ar": "اتركه فارغًا للإبقاء على الحالي",
    "es": "Deje en blanco para mantener el valor actual"
  },
  "Ledger": {
    "fr": "Grand livre",
    "ar": "دفتر الأستاذ",
    "es": "Libro mayor"
  },
  "Lender": {
    "fr": "Prêteur",
    "ar": "المقرض",
    "es": "Prestamista"
  },
  "Level": {
    "fr": "Niveau",
    "ar": "المستوى",
    "es": "Nivel"
  },
  "Linked entries": {
    "fr": "Liées écritures",
    "ar": "مرتبطة قيود",
    "es": "Vinculadas asientos"
  },
  "Loading HR data...": {
    "fr": "Chargement HR Données...",
    "ar": "جار التحميل HR البيانات...",
    "es": "Cargando HR Datos..."
  },
  "Loading audit logs...": {
    "fr": "Chargement Audit Journaux...",
    "ar": "جار التحميل التدقيق السجلات...",
    "es": "Cargando Auditoría Registros..."
  },
  "Loading backups...": {
    "fr": "Chargement backups...",
    "ar": "جار التحميل backups...",
    "es": "Cargando backups..."
  },
  "Loading members...": {
    "fr": "Chargement Membres...",
    "ar": "جار التحميل الأعضاء...",
    "es": "Cargando Miembros..."
  },
  "Loading page...": {
    "fr": "Chargement page...",
    "ar": "جار التحميل صفحة...",
    "es": "Cargando página..."
  },
  "Loading plans...": {
    "fr": "Chargement Abonnements...",
    "ar": "جار التحميل الخطط...",
    "es": "Cargando Planes..."
  },
  "Loading profile...": {
    "fr": "Chargement Profil...",
    "ar": "جار التحميل الملف...",
    "es": "Cargando Perfil..."
  },
  "Loading report sections...": {
    "fr": "Chargement Rapport sections...",
    "ar": "جار التحميل تقرير sections...",
    "es": "Cargando Reporte sections..."
  },
  "Loading reports...": {
    "fr": "Chargement Rapports...",
    "ar": "جار التحميل التقارير...",
    "es": "Cargando Reportes..."
  },
  "Loading screen report catalog...": {
    "fr": "Chargement screen Rapport Catalogue...",
    "ar": "جار التحميل screen تقرير كتالوج...",
    "es": "Cargando screen Reporte Catálogo..."
  },
  "Loading settings...": {
    "fr": "Chargement Paramètres...",
    "ar": "جار التحميل الإعدادات...",
    "es": "Cargando Configuración..."
  },
  "Loans / Rentals": {
    "fr": "Prêts / Locations",
    "ar": "القروض / الإيجارات",
    "es": "Préstamos / Alquileres"
  },
  "Location": {
    "fr": "Lieu",
    "ar": "الموقع",
    "es": "Ubicación"
  },
  "Locations available for classes and PT.": {
    "fr": "Lieux disponibles pour les cours et le coaching privé.",
    "ar": "المواقع المتاحة للحصص والتدريب الخاص.",
    "es": "Ubicaciones disponibles para clases y entrenamiento personal."
  },
  "Low Stock Items": {
    "fr": "Faible Stock Items",
    "ar": "منخفض المخزون Items",
    "es": "Bajo Stock Items"
  },
  "Low stock": {
    "fr": "Faible stock",
    "ar": "منخفض المخزون",
    "es": "Bajo stock"
  },
  "Manage daily automated backups and perform manual exports to secure your system data.": {
    "fr": "Gérez les sauvegardes automatiques quotidiennes et effectuez des exports manuels pour sécuriser les données du système.",
    "ar": "أدر النسخ الاحتياطي اليومي التلقائي ونفّذ تصديرات يدوية لتأمين بيانات النظام.",
    "es": "Gestione copias de seguridad automáticas diarias y exportaciones manuales para proteger los datos del sistema."
  },
  "Manage employee profiles and scheduling.": {
    "fr": "Gérez les profils employés et les plannings.",
    "ar": "أدر ملفات الموظفين والجدولة.",
    "es": "Gestione perfiles de empleados y programación."
  },
  "Manage employees, attendance, contracts, salary rules, payroll runs, and approvals.": {
    "fr": "Gérez les employés, présences, contrats, règles salariales, cycles de paie et approbations.",
    "ar": "أدر الموظفين والحضور والعقود وقواعد الرواتب ودورات الرواتب والموافقات.",
    "es": "Gestione empleados, asistencia, contratos, reglas salariales, corridas de nómina y aprobaciones."
  },
  "Manual / General": {
    "fr": "Manuel / Général",
    "ar": "يدوي / عام",
    "es": "Manual / General"
  },
  "Mark Paid": {
    "fr": "Mark Payé",
    "ar": "Mark مدفوع",
    "es": "Mark Pagado"
  },
  "Mark paid": {
    "fr": "Mark Payé",
    "ar": "Mark مدفوع",
    "es": "Mark Pagado"
  },
  "Max amount": {
    "fr": "Max Montant",
    "ar": "Max المبلغ",
    "es": "Max Importe"
  },
  "Max stock": {
    "fr": "Max stock",
    "ar": "Max المخزون",
    "es": "Max stock"
  },
  "Medical allowance": {
    "fr": "Medical indemnité",
    "ar": "Medical بدل",
    "es": "Medical asignación"
  },
  "Member Profile": {
    "fr": "Member Profil",
    "ar": "Member الملف",
    "es": "Member Perfil"
  },
  "Members API unavailable": {
    "fr": "Membres API unavailable",
    "ar": "الأعضاء API unavailable",
    "es": "Miembros API unavailable"
  },
  "Min amount": {
    "fr": "Min Montant",
    "ar": "Min المبلغ",
    "es": "Min Importe"
  },
  "Min stock": {
    "fr": "Min stock",
    "ar": "Min المخزون",
    "es": "Min stock"
  },
  "Monthly Cost": {
    "fr": "Monthly Coût",
    "ar": "Monthly التكلفة",
    "es": "Monthly Costo"
  },
  "Monthly Payment": {
    "fr": "Monthly Paiement",
    "ar": "Monthly الدفع",
    "es": "Monthly Pago"
  },
  "Most frequent 401/403 paths and actors in the selected range.": {
    "fr": "Chemins et acteurs 401/403 les plus fréquents sur la période sélectionnée.",
    "ar": "أكثر مسارات وأطراف 401/403 تكرارًا ضمن الفترة المحددة.",
    "es": "Rutas y actores 401/403 más frecuentes en el rango seleccionado."
  },
  "New Group Class": {
    "fr": "New Group Cours",
    "ar": "New Group حصة",
    "es": "New Group Clase"
  },
  "New Password": {
    "fr": "New Mot de passe",
    "ar": "New كلمة المرور",
    "es": "New Contraseña"
  },
  "New Password (Optional)": {
    "fr": "New Mot de passe (Optionnel)",
    "ar": "New كلمة المرور (اختياري)",
    "es": "New Contraseña (Opcional)"
  },
  "New Plan": {
    "fr": "New Abonnement",
    "ar": "New خطة",
    "es": "New Plan"
  },
  "New Purchase Order": {
    "fr": "New Purchase Commande",
    "ar": "New Purchase طلب",
    "es": "New Purchase Pedido"
  },
  "New Supplier": {
    "fr": "New Fournisseur",
    "ar": "New مورد",
    "es": "New Proveedor"
  },
  "Next Week": {
    "fr": "Next Semaine",
    "ar": "Next الأسبوع",
    "es": "Next Semana"
  },
  "No API timing data.": {
    "fr": "No API timing Données.",
    "ar": "No API timing البيانات.",
    "es": "No API timing Datos."
  },
  "No action logs found matching your filters.": {
    "fr": "Aucun journal d’action ne correspond à vos filtres.",
    "ar": "لا توجد سجلات إجراءات تطابق الفلاتر.",
    "es": "No se encontraron registros de acciones que coincidan con sus filtros."
  },
  "No active plans available": {
    "fr": "No Actif Abonnements disponibles",
    "ar": "No نشط الخطط متاحة",
    "es": "No Activo Planes disponibles"
  },
  "No address": {
    "fr": "No Adresse",
    "ar": "No العنوان",
    "es": "No Dirección"
  },
  "No classes": {
    "fr": "No Cours",
    "ar": "No الحصص",
    "es": "No Clases"
  },
  "No database backups found.": {
    "fr": "No Base de données backups found.",
    "ar": "No قاعدة البيانات backups found.",
    "es": "No Base de datos backups found."
  },
  "No denied access events.": {
    "fr": "No Refusé Accès events.",
    "ar": "No مرفوض وصول events.",
    "es": "No Denegado Acceso events."
  },
  "No employees found.": {
    "fr": "No employés found.",
    "ar": "No موظفون found.",
    "es": "No empleados found."
  },
  "No failing integrity checks detected.": {
    "fr": "No En échec Intégrité Contrôles detected.",
    "ar": "No متعثر السلامة الفحوصات detected.",
    "es": "No Con fallos Integridad Controles detected."
  },
  "No invoices recorded.": {
    "fr": "No Factures recorded.",
    "ar": "No الفواتير recorded.",
    "es": "No Facturas recorded."
  },
  "No members match these filters": {
    "fr": "No Membres match these filters",
    "ar": "No الأعضاء match these filters",
    "es": "No Miembros match these filters"
  },
  "No membership plans yet": {
    "fr": "No membership Abonnements yet",
    "ar": "No membership الخطط yet",
    "es": "No membership Planes yet"
  },
  "No password reset delivery records in range.": {
    "fr": "No Mot de passe Réinitialisation Livraison records in plage.",
    "ar": "No كلمة المرور إعادة تعيين التسليم records in نطاق.",
    "es": "No Contraseña Restablecimiento Entrega records in rango."
  },
  "No payroll items selected.": {
    "fr": "No paie éléments selected.",
    "ar": "No الرواتب عناصر selected.",
    "es": "No nómina artículos selected."
  },
  "No payroll runs yet.": {
    "fr": "No paie cycles yet.",
    "ar": "No الرواتب الدورات yet.",
    "es": "No nómina corridas yet."
  },
  "No phone": {
    "fr": "No Téléphone",
    "ar": "No الهاتف",
    "es": "No Teléfono"
  },
  "No platform audit data yet.": {
    "fr": "No platform Audit Données yet.",
    "ar": "No platform التدقيق البيانات yet.",
    "es": "No platform Auditoría Datos yet."
  },
  "No private sessions": {
    "fr": "No Privé sessions",
    "ar": "No خاص sessions",
    "es": "No Privado sessions"
  },
  "No purchase orders": {
    "fr": "No purchase Commandes",
    "ar": "No purchase الطلبات",
    "es": "No purchase Pedidos"
  },
  "No recent scans.": {
    "fr": "No Récent Scans.",
    "ar": "No حديث المسحات.",
    "es": "No Reciente Escaneos."
  },
  "No reports are available for your current role.": {
    "fr": "Aucun rapport n’est disponible pour votre rôle actuel.",
    "ar": "لا توجد تقارير متاحة لدورك الحالي.",
    "es": "No hay reportes disponibles para su rol actual."
  },
  "No screen reports are available for your current role.": {
    "fr": "Aucun rapport d’écran n’est disponible pour votre rôle actuel.",
    "ar": "لا توجد تقارير شاشة متاحة لدورك الحالي.",
    "es": "No hay reportes de pantalla disponibles para su rol actual."
  },
  "No shifts": {
    "fr": "No Shifts",
    "ar": "No المناوبات",
    "es": "No Turnos"
  },
  "No staff found": {
    "fr": "No Personnel found",
    "ar": "No الموظفون found",
    "es": "No Personal found"
  },
  "No subscriptions recorded.": {
    "fr": "No Abonnements recorded.",
    "ar": "No الاشتراكات recorded.",
    "es": "No Suscripciones recorded."
  },
  "No supplier": {
    "fr": "No Fournisseur",
    "ar": "No مورد",
    "es": "No Proveedor"
  },
  "No transactions found": {
    "fr": "No Transactions found",
    "ar": "No المعاملات found",
    "es": "No Transacciones found"
  },
  "Notes (Optional)": {
    "fr": "Notes (Optionnel)",
    "ar": "ملاحظات (اختياري)",
    "es": "Notas (Opcional)"
  },
  "Open menu": {
    "fr": "Ouvert menu",
    "ar": "مفتوح القائمة",
    "es": "Abierto menú"
  },
  "Open purchase exposure:": {
    "fr": "Ouvert purchase exposure:",
    "ar": "مفتوح purchase exposure:",
    "es": "Abierto purchase exposure:"
  },
  "Operational security posture, reset delivery status, access denials, slow requests, and exportable evidence.": {
    "fr": "Posture de sécurité opérationnelle, statut de livraison des réinitialisations, accès refusés, requêtes lentes et preuves exportables.",
    "ar": "وضع الأمان التشغيلي، وحالة تسليم إعادة التعيين، ورفض الوصول، والطلبات البطيئة، والأدلة القابلة للتصدير.",
    "es": "Postura de seguridad operativa, estado de entrega de restablecimientos, accesos denegados, solicitudes lentas y evidencia exportable."
  },
  "Operations Summary": {
    "fr": "Opérations Résumé",
    "ar": "العمليات ملخص",
    "es": "Operaciones Resumen"
  },
  "Optional attendance note": {
    "fr": "Optionnel Présence note",
    "ar": "اختياري الحضور note",
    "es": "Opcional Asistencia note"
  },
  "Optional notes": {
    "fr": "Optionnel Notes",
    "ar": "اختياري ملاحظات",
    "es": "Opcional Notas"
  },
  "Or continue with": {
    "fr": "Or continue avec",
    "ar": "Or continue مع",
    "es": "Or continue con"
  },
  "Order Accuracy": {
    "fr": "Commande Exactitude",
    "ar": "طلب الدقة",
    "es": "Pedido Precisión"
  },
  "Order ID": {
    "fr": "Commande ID",
    "ar": "طلب ID",
    "es": "Pedido ID"
  },
  "Out of Stock": {
    "fr": "Rupture of Stock",
    "ar": "خارج of المخزون",
    "es": "Sin of Stock"
  },
  "PAY NOW": {
    "fr": "PAYER MAINTENANT",
    "ar": "ادفع الآن",
    "es": "PAGAR AHORA"
  },
  "PDF Reports": {
    "fr": "PDF Rapports",
    "ar": "PDF التقارير",
    "es": "PDF Reportes"
  },
  "POS Sales": {
    "fr": "POS Ventes",
    "ar": "POS المبيعات",
    "es": "POS Ventas"
  },
  "Paid leave": {
    "fr": "Payé congé",
    "ar": "مدفوع إجازة",
    "es": "Pagado licencia"
  },
  "Parent category": {
    "fr": "Parent Catégorie",
    "ar": "أصل الفئة",
    "es": "Padre Categoría"
  },
  "Part-time": {
    "fr": "Temps-Heure",
    "ar": "جزئي-الوقت",
    "es": "Medio-Hora"
  },
  "Password": {
    "fr": "Mot de passe",
    "ar": "كلمة المرور",
    "es": "Contraseña"
  },
  "Password Reset Delivery History": {
    "fr": "Mot de passe Réinitialisation Livraison History",
    "ar": "كلمة المرور إعادة تعيين التسليم History",
    "es": "Contraseña Restablecimiento Entrega History"
  },
  "Paste reset token": {
    "fr": "Collez le jeton de réinitialisation",
    "ar": "الصق رمز إعادة التعيين",
    "es": "Pegue el token de restablecimiento"
  },
  "Path": {
    "fr": "Chemin",
    "ar": "مسار",
    "es": "Ruta"
  },
  "Payment": {
    "fr": "Paiement",
    "ar": "الدفع",
    "es": "Pago"
  },
  "Payment terms": {
    "fr": "Paiement conditions",
    "ar": "الدفع الشروط",
    "es": "Pago términos"
  },
  "Payroll Expense Transactions": {
    "fr": "Paie Dépense Transactions",
    "ar": "الرواتب مصروف المعاملات",
    "es": "Nómina Gasto Transacciones"
  },
  "Payroll Posting": {
    "fr": "Paie Imputation",
    "ar": "الرواتب ترحيل",
    "es": "Nómina Contabilización"
  },
  "Payroll run": {
    "fr": "Paie cycle",
    "ar": "الرواتب دورة",
    "es": "Nómina corrida"
  },
  "Payroll runs": {
    "fr": "Paie cycles",
    "ar": "الرواتب الدورات",
    "es": "Nómina corridas"
  },
  "Personal Training Area, Sala A, Sala B...": {
    "fr": "Personnel Training Zone, Sala A, Sala B...",
    "ar": "شخصي تدريب منطقة, Sala A, Sala B...",
    "es": "Personal Entrenamiento Área, Sala A, Sala B..."
  },
  "Photo (Optional)": {
    "fr": "Photo (Optionnel)",
    "ar": "صورة (اختياري)",
    "es": "Foto (Opcional)"
  },
  "Plan and subscription PDFs": {
    "fr": "Abonnement and Abonnement PDFs",
    "ar": "خطة and اشتراك PDFs",
    "es": "Plan and Suscripción PDFs"
  },
  "Plan needs attention": {
    "fr": "Abonnement needs attention",
    "ar": "خطة needs attention",
    "es": "Plan needs attention"
  },
  "Plans API unavailable": {
    "fr": "Abonnements API unavailable",
    "ar": "الخطط API unavailable",
    "es": "Planes API unavailable"
  },
  "Post Payroll": {
    "fr": "Comptabiliser Paie",
    "ar": "ترحيل الرواتب",
    "es": "Contabilizar Nómina"
  },
  "Post Payroll to Accounting": {
    "fr": "Comptabiliser Paie À Comptabilité",
    "ar": "ترحيل الرواتب إلى محاسبة",
    "es": "Contabilizar Nómina Hasta Contabilidad"
  },
  "Posture": {
    "fr": "Posture",
    "ar": "الوضع",
    "es": "Postura"
  },
  "PowerGym QR e-Card": {
    "fr": "PowerGym QR e-Carte",
    "ar": "PowerGym QR إلكترونية-بطاقة",
    "es": "PowerGym QR e-Tarjeta"
  },
  "Present": {
    "fr": "Présent",
    "ar": "حاضر",
    "es": "Presente"
  },
  "Present this QR e-card at reception...": {
    "fr": "Présentez cette carte e‑QR à la réception...",
    "ar": "قدّم بطاقة QR الإلكترونية هذه عند الاستقبال...",
    "es": "Presente esta e‑card QR en recepción..."
  },
  "Prev Week": {
    "fr": "Préc. Semaine",
    "ar": "السابق الأسبوع",
    "es": "Ant. Semana"
  },
  "Primary Contacts": {
    "fr": "Principaux Contacts",
    "ar": "أساسية جهات الاتصال",
    "es": "Principales Contactos"
  },
  "Principal": {
    "fr": "Principal",
    "ar": "الأصل",
    "es": "Principal"
  },
  "Print Class": {
    "fr": "Imprimer Cours",
    "ar": "طباعة حصة",
    "es": "Imprimir Clase"
  },
  "Print Scheduled Session": {
    "fr": "Imprimer Planifié Session",
    "ar": "طباعة مجدول Session",
    "es": "Imprimir Programada Session"
  },
  "Private PT screen PDFs": {
    "fr": "Privé PT screen PDFs",
    "ar": "خاص PT screen PDFs",
    "es": "Privado PT screen PDFs"
  },
  "Process recurring entries": {
    "fr": "Traiter Récurrent écritures",
    "ar": "معالجة متكرر قيود",
    "es": "Procesar Recurrente asientos"
  },
  "Processes enabled recurring finance entries for the current month.": {
    "fr": "Traite les écritures financières récurrentes activées pour le mois en cours.",
    "ar": "يعالج القيود المالية المتكررة المفعلة للشهر الحالي.",
    "es": "Procesa asientos financieros recurrentes habilitados para el mes actual."
  },
  "Product image": {
    "fr": "Produit Image",
    "ar": "منتج صورة",
    "es": "Producto Imagen"
  },
  "Product preview": {
    "fr": "Produit aperçu",
    "ar": "منتج معاينة",
    "es": "Producto vista previa"
  },
  "Promo code": {
    "fr": "Promo code",
    "ar": "ترويجي code",
    "es": "Promoción code"
  },
  "Purchase Orders": {
    "fr": "Purchase Commandes",
    "ar": "Purchase الطلبات",
    "es": "Purchase Pedidos"
  },
  "Purchases": {
    "fr": "Achats",
    "ar": "المشتريات",
    "es": "Compras"
  },
  "QR Access Control": {
    "fr": "QR Accès Control",
    "ar": "QR وصول Control",
    "es": "QR Acceso Control"
  },
  "QR E-card": {
    "fr": "QR E-Carte",
    "ar": "QR E-بطاقة",
    "es": "QR E-Tarjeta"
  },
  "QR e-Card Template": {
    "fr": "QR e-Carte Template",
    "ar": "QR إلكترونية-بطاقة Template",
    "es": "QR e-Tarjeta Template"
  },
  "QR e-card background preview": {
    "fr": "QR e-Carte Arrière-plan aperçu",
    "ar": "QR إلكترونية-بطاقة الخلفية معاينة",
    "es": "QR e-Tarjeta Fondo vista previa"
  },
  "Quantity": {
    "fr": "Quantité",
    "ar": "الكمية",
    "es": "Cantidad"
  },
  "Quantity delta": {
    "fr": "Quantité écart",
    "ar": "الكمية الفرق",
    "es": "Cantidad delta"
  },
  "Reads the same QR code generated from Member Directory. USB/handheld QR readers continue to work through the input below.": {
    "fr": "Lit le même QR code généré depuis l’annuaire des membres. Les lecteurs QR USB/portables continuent de fonctionner via le champ ci-dessous.",
    "ar": "يقرأ نفس رمز QR الذي تم إنشاؤه من دليل الأعضاء. تستمر قارئات QR عبر USB أو المحمولة بالعمل من خلال الإدخال أدناه.",
    "es": "Lee el mismo código QR generado desde el directorio de miembros. Los lectores QR USB/de mano siguen funcionando mediante el campo inferior."
  },
  "Ready": {
    "fr": "Prêt",
    "ar": "جاهز",
    "es": "Listo"
  },
  "Reason": {
    "fr": "Raison",
    "ar": "السبب",
    "es": "Motivo"
  },
  "Receipt PDF": {
    "fr": "Reçu PDF",
    "ar": "إيصال PDF",
    "es": "Recibo PDF"
  },
  "Received": {
    "fr": "Reçu",
    "ar": "تم الاستلام",
    "es": "Recibido"
  },
  "Recent POS Sales": {
    "fr": "Récent POS Ventes",
    "ar": "حديث POS المبيعات",
    "es": "Reciente POS Ventas"
  },
  "Recent Scans": {
    "fr": "Récent Scans",
    "ar": "حديث المسحات",
    "es": "Reciente Escaneos"
  },
  "Recent Tickets": {
    "fr": "Récent Tickets",
    "ar": "حديث التذاكر",
    "es": "Reciente Tickets"
  },
  "Recent runs": {
    "fr": "Récent cycles",
    "ar": "حديث الدورات",
    "es": "Reciente corridas"
  },
  "Recent system actions and changes. Showing up to last 100 events.": {
    "fr": "Actions et changements système récents. Affichage des 100 derniers événements maximum.",
    "ar": "إجراءات وتغييرات النظام الأخيرة. عرض حتى آخر 100 حدث.",
    "es": "Acciones y cambios recientes del sistema. Muestra hasta los últimos 100 eventos."
  },
  "Recommendation": {
    "fr": "Recommandation",
    "ar": "توصية",
    "es": "Recomendación"
  },
  "Recurring Processing": {
    "fr": "Récurrent Traitement",
    "ar": "متكرر معالجة",
    "es": "Recurrente Procesamiento"
  },
  "Reference": {
    "fr": "Référence",
    "ar": "مرجع",
    "es": "Referencia"
  },
  "Refresh": {
    "fr": "Actualiser",
    "ar": "تحديث",
    "es": "Actualizar"
  },
  "Remove": {
    "fr": "Supprimer",
    "ar": "إزالة",
    "es": "Eliminar"
  },
  "Remove Background": {
    "fr": "Supprimer Arrière-plan",
    "ar": "إزالة الخلفية",
    "es": "Eliminar Fondo"
  },
  "Renew": {
    "fr": "Renouveler",
    "ar": "تجديد",
    "es": "Renovar"
  },
  "Renew Subscription": {
    "fr": "Renouveler Abonnement",
    "ar": "تجديد اشتراك",
    "es": "Renovar Suscripción"
  },
  "Reporting & Analytics": {
    "fr": "Reporting & Analytique",
    "ar": "التقارير & التحليلات",
    "es": "Informes & Analítica"
  },
  "Request New Token": {
    "fr": "Demande New Token",
    "ar": "طلب New Token",
    "es": "Solicitud New Token"
  },
  "Requests": {
    "fr": "Demandes",
    "ar": "الطلبات",
    "es": "Solicitudes"
  },
  "Requests are now saved as structured tickets and notify the admin team in-app.": {
    "fr": "Les demandes sont désormais enregistrées comme tickets structurés et notifient l’équipe admin dans l’application.",
    "ar": "يتم حفظ الطلبات الآن كتذاكر منظمة وإشعار فريق الإدارة داخل التطبيق.",
    "es": "Las solicitudes ahora se guardan como tickets estructurados y notifican al equipo administrador en la app."
  },
  "Reset": {
    "fr": "Réinitialisation",
    "ar": "إعادة تعيين",
    "es": "Restablecimiento"
  },
  "Reset Failed": {
    "fr": "Réinitialisation Échec",
    "ar": "إعادة تعيين فشل",
    "es": "Restablecimiento Fallido"
  },
  "Reset Sent": {
    "fr": "Réinitialisation Envoyé",
    "ar": "إعادة تعيين مرسل",
    "es": "Restablecimiento Enviado"
  },
  "Reset Status": {
    "fr": "Réinitialisation Statut",
    "ar": "إعادة تعيين الحالة",
    "es": "Restablecimiento Estado"
  },
  "Reset Token": {
    "fr": "Réinitialisation Token",
    "ar": "إعادة تعيين Token",
    "es": "Restablecimiento Token"
  },
  "Reset Used": {
    "fr": "Réinitialisation Utilisé",
    "ar": "إعادة تعيين مستخدم",
    "es": "Restablecimiento Usado"
  },
  "Reset filters": {
    "fr": "Réinitialisation filters",
    "ar": "إعادة تعيين filters",
    "es": "Restablecimiento filters"
  },
  "Result": {
    "fr": "Résultat",
    "ar": "النتيجة",
    "es": "Resultado"
  },
  "Role": {
    "fr": "Rôle",
    "ar": "الدور",
    "es": "Rol"
  },
  "Room": {
    "fr": "Salle",
    "ar": "غرفة",
    "es": "Sala"
  },
  "Rooms / Locations (comma separated)": {
    "fr": "Salles / Lieux (comma separated)",
    "ar": "الغرف / المواقع (comma separated)",
    "es": "Salas / Ubicaciones (comma separated)"
  },
  "Root category": {
    "fr": "Racine Catégorie",
    "ar": "جذر الفئة",
    "es": "Raíz Categoría"
  },
  "Route": {
    "fr": "Route",
    "ar": "مسار",
    "es": "Ruta"
  },
  "Rows": {
    "fr": "Lignes",
    "ar": "صفوف",
    "es": "Filas"
  },
  "Run month": {
    "fr": "Cycle mois",
    "ar": "تشغيل الشهر",
    "es": "Corrida mes"
  },
  "Running diagnostics...": {
    "fr": "Exécution diagnostics...",
    "ar": "جار التشغيل diagnostics...",
    "es": "Ejecutando diagnostics..."
  },
  "Safe repair workflow": {
    "fr": "Sûr réparation workflow",
    "ar": "آمن إصلاح workflow",
    "es": "Seguro reparación workflow"
  },
  "Sales trends with category filters.": {
    "fr": "Tendances de vente avec filtres de catégorie.",
    "ar": "اتجاهات المبيعات مع فلاتر الفئات.",
    "es": "Tendencias de ventas con filtros de categoría."
  },
  "Sales, Management, Training...": {
    "fr": "Ventes, Gestion, Training...",
    "ar": "المبيعات, الإدارة, تدريب...",
    "es": "Ventas, Gestión, Entrenamiento..."
  },
  "Save Budget": {
    "fr": "Enregistrer Budget",
    "ar": "حفظ Budget",
    "es": "Guardar Budget"
  },
  "Save General Settings": {
    "fr": "Enregistrer Général Paramètres",
    "ar": "حفظ عام الإعدادات",
    "es": "Guardar General Configuración"
  },
  "Save Loan": {
    "fr": "Enregistrer Prêt",
    "ar": "حفظ قرض",
    "es": "Guardar Préstamo"
  },
  "Save Rental": {
    "fr": "Enregistrer Location",
    "ar": "حفظ إيجار",
    "es": "Guardar Alquiler"
  },
  "Save Shift": {
    "fr": "Enregistrer Shift",
    "ar": "حفظ مناوبة",
    "es": "Guardar Turno"
  },
  "Save attendance": {
    "fr": "Enregistrer Présence",
    "ar": "حفظ الحضور",
    "es": "Guardar Asistencia"
  },
  "Scan QR with USB reader or paste secure token...": {
    "fr": "Scannez le QR avec un lecteur USB ou collez le jeton sécurisé...",
    "ar": "امسح QR بقارئ USB أو الصق الرمز الآمن...",
    "es": "Escanee QR con lector USB o pegue el token seguro..."
  },
  "Scan a barcode or select products to add them to the sale.": {
    "fr": "Scannez un code-barres ou sélectionnez des produits pour les ajouter à la vente.",
    "ar": "امسح باركودًا أو اختر منتجات لإضافتها إلى البيع.",
    "es": "Escanee un código de barras o seleccione productos para agregarlos a la venta."
  },
  "Scan a member e-card. The backend checks token integrity, token expiry, member status, and active subscription dates.": {
    "fr": "Scannez la carte e‑membre. Le backend vérifie l’intégrité du jeton, son expiration, le statut du membre et les dates d’abonnement actif.",
    "ar": "امسح بطاقة العضو الإلكترونية. يتحقق الخادم من سلامة الرمز وانتهائه وحالة العضو وتواريخ الاشتراك النشط.",
    "es": "Escanee una e‑card de miembro. El backend verifica integridad del token, vencimiento, estado del miembro y fechas de suscripción activa."
  },
  "Scan this at the reception to check in.": {
    "fr": "Scannez ceci à la réception pour l’enregistrement.",
    "ar": "امسح هذا عند الاستقبال لتسجيل الدخول.",
    "es": "Escanee esto en recepción para registrar entrada."
  },
  "Scanner Terminal": {
    "fr": "Scanner Terminal",
    "ar": "ماسح Terminal",
    "es": "Escáner Terminal"
  },
  "Search Actions": {
    "fr": "Search Actions",
    "ar": "Search إجراءات",
    "es": "Search Acciones"
  },
  "Search and maintain employee salary, contract, and allowance records.": {
    "fr": "Recherchez et maintenez les dossiers de salaires, contrats et indemnités des employés.",
    "ar": "ابحث وحدّث سجلات رواتب الموظفين والعقود والبدلات.",
    "es": "Busque y mantenga registros de salario, contrato y asignaciones de empleados."
  },
  "Search by name, email, or phone": {
    "fr": "Rechercher par nom, e-mail ou téléphone",
    "ar": "ابحث بالاسم أو البريد الإلكتروني أو الهاتف",
    "es": "Buscar por nombre, correo o teléfono"
  },
  "Search employees": {
    "fr": "Search employés",
    "ar": "Search موظفون",
    "es": "Search empleados"
  },
  "Search staff, phone, role, or shifts by name...": {
    "fr": "Rechercher le personnel, téléphone, rôle ou shifts par nom...",
    "ar": "ابحث عن الموظفين أو الهاتف أو الدور أو المناوبات بالاسم...",
    "es": "Buscar personal, teléfono, rol o turnos por nombre..."
  },
  "Search, create, renew, and issue QR e-cards.": {
    "fr": "Rechercher, créer, renouveler et émettre des cartes e‑QR.",
    "ar": "ابحث وأنشئ وجدّد وأصدر بطاقات QR الإلكترونية.",
    "es": "Buscar, crear, renovar y emitir e‑cards QR."
  },
  "Secure token generated. The raw value is embedded only in the QR code and is not displayed.": {
    "fr": "Jeton sécurisé généré. La valeur brute est intégrée uniquement dans le QR code et n’est pas affichée.",
    "ar": "تم إنشاء رمز آمن. القيمة الأصلية مضمنة فقط في رمز QR ولا تُعرض.",
    "es": "Token seguro generado. El valor sin procesar se integra solo en el código QR y no se muestra."
  },
  "Security & Reports": {
    "fr": "Sécurité & Rapports",
    "ar": "الأمان & التقارير",
    "es": "Seguridad & Reportes"
  },
  "Security Alerts": {
    "fr": "Sécurité Alerts",
    "ar": "الأمان Alerts",
    "es": "Seguridad Alerts"
  },
  "Security Center": {
    "fr": "Sécurité Centre",
    "ar": "الأمان مركز",
    "es": "Seguridad Centro"
  },
  "Security and audit PDFs": {
    "fr": "Sécurité and Audit PDFs",
    "ar": "الأمان and التدقيق PDFs",
    "es": "Seguridad and Auditoría PDFs"
  },
  "Select Employees": {
    "fr": "Sélectionner Employés",
    "ar": "اختيار الموظفون",
    "es": "Seleccionar Empleados"
  },
  "Select department": {
    "fr": "Sélectionner Département",
    "ar": "اختيار القسم",
    "es": "Seleccionar Departamento"
  },
  "Select employee": {
    "fr": "Sélectionner employé",
    "ar": "اختيار موظف",
    "es": "Seleccionar empleado"
  },
  "Select member": {
    "fr": "Sélectionner member",
    "ar": "اختيار member",
    "es": "Seleccionar member"
  },
  "Select payroll run": {
    "fr": "Sélectionner paie cycle",
    "ar": "اختيار الرواتب دورة",
    "es": "Seleccionar nómina corrida"
  },
  "Select role": {
    "fr": "Sélectionner Rôle",
    "ar": "اختيار الدور",
    "es": "Seleccionar Rol"
  },
  "Select staff...": {
    "fr": "Sélectionner Personnel...",
    "ar": "اختيار الموظفون...",
    "es": "Seleccionar Personal..."
  },
  "Select supplier": {
    "fr": "Sélectionner Fournisseur",
    "ar": "اختيار مورد",
    "es": "Seleccionar Proveedor"
  },
  "Select trainer": {
    "fr": "Sélectionner Coach",
    "ar": "اختيار مدرب",
    "es": "Seleccionar Entrenador"
  },
  "Sent": {
    "fr": "Envoyé",
    "ar": "مرسل",
    "es": "Enviado"
  },
  "Severity": {
    "fr": "Gravité",
    "ar": "الشدة",
    "es": "Severidad"
  },
  "Shift Schedule": {
    "fr": "Shift Schedule",
    "ar": "مناوبة Schedule",
    "es": "Turno Schedule"
  },
  "Ship": {
    "fr": "Expédier",
    "ar": "شحن",
    "es": "Enviar"
  },
  "Shipped": {
    "fr": "Expédié",
    "ar": "تم الشحن",
    "es": "Enviado"
  },
  "Sign in with Google": {
    "fr": "Se connecter in avec Google",
    "ar": "تسجيل الدخول in مع Google",
    "es": "Iniciar sesión in con Google"
  },
  "Skipped": {
    "fr": "Ignoré",
    "ar": "متخطى",
    "es": "Omitido"
  },
  "Slowest API Requests": {
    "fr": "Plus lents API Demandes",
    "ar": "الأبطأ API الطلبات",
    "es": "Más lentas API Solicitudes"
  },
  "Source": {
    "fr": "Source",
    "ar": "المصدر",
    "es": "Fuente"
  },
  "Spinning": {
    "fr": "Rotation",
    "ar": "دوران",
    "es": "Spinning"
  },
  "Staff Departments (comma separated)": {
    "fr": "Personnel Départements (comma separated)",
    "ar": "الموظفون الأقسام (comma separated)",
    "es": "Personal Departamentos (comma separated)"
  },
  "Staff Management": {
    "fr": "Personnel Gestion",
    "ar": "الموظفون الإدارة",
    "es": "Personal Gestión"
  },
  "Staff Members": {
    "fr": "Personnel Membres",
    "ar": "الموظفون الأعضاء",
    "es": "Personal Miembros"
  },
  "Staff Roles (comma separated)": {
    "fr": "Personnel Rôles (comma separated)",
    "ar": "الموظفون الأدوار (comma separated)",
    "es": "Personal Roles (comma separated)"
  },
  "Staff screen PDFs": {
    "fr": "Personnel screen PDFs",
    "ar": "الموظفون screen PDFs",
    "es": "Personal screen PDFs"
  },
  "Start": {
    "fr": "Début",
    "ar": "البداية",
    "es": "Inicio"
  },
  "Start Date": {
    "fr": "Début Date",
    "ar": "البداية Date",
    "es": "Inicio Date"
  },
  "Start Webcam Scan": {
    "fr": "Début Webcam Scanner",
    "ar": "البداية Webcam مسح",
    "es": "Inicio Webcam Escanear"
  },
  "Start the webcam scanner, then point the camera at the member QR e-card.": {
    "fr": "Démarrez le scanner webcam, puis pointez la caméra vers la carte e‑QR du membre.",
    "ar": "ابدأ ماسح كاميرا الويب ثم وجّه الكاميرا إلى بطاقة QR الإلكترونية للعضو.",
    "es": "Inicie el escáner de webcam y apunte la cámara a la e‑card QR del miembro."
  },
  "Status:": {
    "fr": "Statut:",
    "ar": "الحالة:",
    "es": "Estado:"
  },
  "Stock valuation, aging and reorder status.": {
    "fr": "Valorisation du stock, vieillissement et statut de réapprovisionnement.",
    "ar": "تقييم المخزون وتقادم المخزون وحالة إعادة الطلب.",
    "es": "Valoración de stock, antigüedad y estado de reorden."
  },
  "Stop Camera": {
    "fr": "Arrêter Camera",
    "ar": "إيقاف Camera",
    "es": "Detener Camera"
  },
  "Storage Usage (Last 30 Days)": {
    "fr": "Stockage Utilisation (Derniers 30 jours)",
    "ar": "التخزين الاستخدام (آخر 30 أيام)",
    "es": "Almacenamiento Uso (Últimos 30 días)"
  },
  "Strength": {
    "fr": "Force",
    "ar": "القوة",
    "es": "Fuerza"
  },
  "Subscription Catalog": {
    "fr": "Abonnement Catalogue",
    "ar": "اشتراك كتالوج",
    "es": "Suscripción Catálogo"
  },
  "Subscriptions": {
    "fr": "Abonnements",
    "ar": "الاشتراكات",
    "es": "Suscripciones"
  },
  "Subtotal": {
    "fr": "Sous-total",
    "ar": "المجموع الفرعي",
    "es": "Subtotal"
  },
  "Supplier Performance": {
    "fr": "Fournisseur Performance",
    "ar": "مورد الأداء",
    "es": "Proveedor Rendimiento"
  },
  "Supplier spend, POs and receiving history.": {
    "fr": "Dépenses fournisseur, bons de commande et historique de réception.",
    "ar": "إنفاق المورد وأوامر الشراء وسجل الاستلام.",
    "es": "Gasto por proveedor, órdenes de compra e historial de recepción."
  },
  "System Health": {
    "fr": "Système Health",
    "ar": "النظام Health",
    "es": "Sistema Health"
  },
  "System Settings": {
    "fr": "Système Paramètres",
    "ar": "النظام الإعدادات",
    "es": "Sistema Configuración"
  },
  "TOTAL": {
    "fr": "TOTAL",
    "ar": "الإجمالي",
    "es": "TOTAL"
  },
  "Target": {
    "fr": "Cible",
    "ar": "الهدف",
    "es": "Objetivo"
  },
  "Tax (8.5%)": {
    "fr": "Taxe (8.5%)",
    "ar": "الضريبة (8.5%)",
    "es": "Impuesto (8.5%)"
  },
  "Tax deduction": {
    "fr": "Taxe retenue",
    "ar": "الضريبة اقتطاع",
    "es": "Impuesto deducción"
  },
  "Temporary": {
    "fr": "Temporaire",
    "ar": "مؤقت",
    "es": "Temporal"
  },
  "Terminated": {
    "fr": "Terminé",
    "ar": "منتهي",
    "es": "Terminado"
  },
  "These filters apply to the all-sections PDF and legacy section PDFs that use period totals.": {
    "fr": "Ces filtres s’appliquent au PDF toutes sections et aux anciens PDF de section utilisant les totaux de période.",
    "ar": "تنطبق هذه الفلاتر على ملف PDF لكل الأقسام وملفات PDF القديمة التي تستخدم إجماليات الفترة.",
    "es": "Estos filtros se aplican al PDF de todas las secciones y a PDFs heredados de sección que usan totales del período."
  },
  "This month payroll": {
    "fr": "Ce mois paie",
    "ar": "هذا الشهر الرواتب",
    "es": "Este mes nómina"
  },
  "To Date": {
    "fr": "À Date",
    "ar": "إلى Date",
    "es": "Hasta Date"
  },
  "Today": {
    "fr": "Aujourd’hui",
    "ar": "اليوم",
    "es": "Hoy"
  },
  "Top Denied Access": {
    "fr": "Principaux Refusé Accès",
    "ar": "أعلى مرفوض وصول",
    "es": "Principales Denegado Acceso"
  },
  "Total Members": {
    "fr": "Total Membres",
    "ar": "الإجمالي الأعضاء",
    "es": "Total Miembros"
  },
  "Total Plans": {
    "fr": "Total Abonnements",
    "ar": "الإجمالي الخطط",
    "es": "Total Planes"
  },
  "Total Value": {
    "fr": "Total Value",
    "ar": "الإجمالي Value",
    "es": "Total Value"
  },
  "Transaction needs attention": {
    "fr": "Transaction needs attention",
    "ar": "معاملة needs attention",
    "es": "Transacción needs attention"
  },
  "Transfer": {
    "fr": "Virement",
    "ar": "تحويل",
    "es": "Transferencia"
  },
  "Transport allowance": {
    "fr": "Transport indemnité",
    "ar": "النقل بدل",
    "es": "Transporte asignación"
  },
  "Trigger Manual Backup": {
    "fr": "Déclencher Manuel Sauvegarde",
    "ar": "تشغيل يدوي نسخة احتياطية",
    "es": "Ejecutar Manual Copia de seguridad"
  },
  "Try clearing the search, status, or access-date filters before creating a new member.": {
    "fr": "Essayez d’effacer les filtres de recherche, statut ou date d’accès avant de créer un nouveau membre.",
    "ar": "جرّب مسح فلاتر البحث أو الحالة أو تاريخ الوصول قبل إنشاء عضو جديد.",
    "es": "Intente borrar los filtros de búsqueda, estado o fecha de acceso antes de crear un nuevo miembro."
  },
  "Type *": {
    "fr": "Type *",
    "ar": "النوع *",
    "es": "Tipo *"
  },
  "Unassigned": {
    "fr": "Non assigné",
    "ar": "غير معين",
    "es": "Sin asignar"
  },
  "Unauthorized/forbidden requests in selected range.": {
    "fr": "Requêtes non autorisées/interdites dans la période sélectionnée.",
    "ar": "طلبات غير مصرح بها/ممنوعة في الفترة المحددة.",
    "es": "Solicitudes no autorizadas/prohibidas en el rango seleccionado."
  },
  "Unit": {
    "fr": "Unité",
    "ar": "الوحدة",
    "es": "Unidad"
  },
  "Unit cost": {
    "fr": "Unité Coût",
    "ar": "الوحدة التكلفة",
    "es": "Unidad Costo"
  },
  "Unpaid leave": {
    "fr": "Non payé congé",
    "ar": "غير مدفوع إجازة",
    "es": "No pagado licencia"
  },
  "Upcoming Shifts": {
    "fr": "À venir Shifts",
    "ar": "قادمة المناوبات",
    "es": "Próximo Turnos"
  },
  "Update Profile": {
    "fr": "Mettre à jour Profil",
    "ar": "تحديث الملف",
    "es": "Actualizar Perfil"
  },
  "Upload": {
    "fr": "Téléverser",
    "ar": "رفع",
    "es": "Subir"
  },
  "Use webcam, USB QR reader, or paste the token generated from the Members screen.": {
    "fr": "Utilisez la webcam, un lecteur QR USB ou collez le jeton généré depuis l’écran Membres.",
    "ar": "استخدم كاميرا الويب أو قارئ QR عبر USB أو الصق الرمز المُنشأ من شاشة الأعضاء.",
    "es": "Use webcam, lector QR USB o pegue el token generado desde la pantalla Miembros."
  },
  "Used to categorize types of employees.": {
    "fr": "Utilisé pour catégoriser les types d’employés.",
    "ar": "يُستخدم لتصنيف أنواع الموظفين.",
    "es": "Se usa para categorizar tipos de empleados."
  },
  "Useful for finding routes that can affect operations or PDF generation.": {
    "fr": "Utile pour trouver les routes pouvant affecter les opérations ou la génération PDF.",
    "ar": "مفيد للعثور على المسارات التي قد تؤثر على العمليات أو إنشاء PDF.",
    "es": "Útil para encontrar rutas que pueden afectar operaciones o generación de PDF."
  },
  "User ID": {
    "fr": "Utilisateur ID",
    "ar": "المستخدم ID",
    "es": "Usuario ID"
  },
  "Validate secure member e-card tokens generated from Member Directory.": {
    "fr": "Validez les jetons de carte e‑membre sécurisés générés depuis l’annuaire des membres.",
    "ar": "تحقق من رموز بطاقات الأعضاء الإلكترونية الآمنة المُنشأة من دليل الأعضاء.",
    "es": "Valide tokens seguros de e‑card de miembro generados desde el directorio de miembros."
  },
  "Validating access token...": {
    "fr": "Validation Accès token...",
    "ar": "جار التحقق وصول token...",
    "es": "Validando Acceso token..."
  },
  "Valuation": {
    "fr": "Valorisation",
    "ar": "التقييم",
    "es": "Valoración"
  },
  "Variance": {
    "fr": "Écart",
    "ar": "التباين",
    "es": "Variación"
  },
  "Verify": {
    "fr": "Vérifier",
    "ar": "تحقق",
    "es": "Verificar"
  },
  "View Details": {
    "fr": "Voir Détails",
    "ar": "عرض تفاصيل",
    "es": "Ver Detalles"
  },
  "View Profile": {
    "fr": "Voir Profil",
    "ar": "عرض الملف",
    "es": "Ver Perfil"
  },
  "Void": {
    "fr": "Annuler",
    "ar": "إلغاء",
    "es": "Anular"
  },
  "Warnings": {
    "fr": "Avertissements",
    "ar": "تحذيرات",
    "es": "Advertencias"
  },
  "Warnings/Errors": {
    "fr": "Avertissements/Erreurs",
    "ar": "تحذيرات/أخطاء",
    "es": "Advertencias/Errores"
  },
  "We specialize in transforming your ideas into reliable, scalable, and future-ready systems.": {
    "fr": "Nous transformons vos idées en systèmes fiables, évolutifs et prêts pour l’avenir.",
    "ar": "نحن متخصصون في تحويل أفكارك إلى أنظمة موثوقة وقابلة للتوسع وجاهزة للمستقبل.",
    "es": "Nos especializamos en transformar sus ideas en sistemas fiables, escalables y preparados para el futuro."
  },
  "Webcam QR detection requires browser BarcodeDetector support. USB QR scanners and manual token entry still work.": {
    "fr": "La détection QR par webcam nécessite la prise en charge de BarcodeDetector par le navigateur. Les scanners QR USB et la saisie manuelle de jeton fonctionnent toujours.",
    "ar": "يتطلب اكتشاف QR عبر كاميرا الويب دعم BarcodeDetector في المتصفح. لا تزال ماسحات QR عبر USB والإدخال اليدوي للرمز تعمل.",
    "es": "La detección QR por webcam requiere soporte de BarcodeDetector en el navegador. Los escáneres QR USB y la entrada manual de token siguen funcionando."
  },
  "Week": {
    "fr": "Semaine",
    "ar": "الأسبوع",
    "es": "Semana"
  },
  "Wholesale": {
    "fr": "Gros",
    "ar": "جملة",
    "es": "Mayorista"
  },
  "Yoga": {
    "fr": "Yoga",
    "ar": "يوغا",
    "es": "Yoga"
  },
  "You have no upcoming classes scheduled.": {
    "fr": "Vous n’avez aucun cours à venir planifié.",
    "ar": "لا توجد لديك حصص قادمة مجدولة.",
    "es": "No tiene clases próximas programadas."
  },
  "e-Card Note": {
    "fr": "e-Carte Note",
    "ar": "إلكترونية-بطاقة Note",
    "es": "e-Tarjeta Note"
  },
  "e-Card Title": {
    "fr": "e-Carte Title",
    "ar": "إلكترونية-بطاقة Title",
    "es": "e-Tarjeta Title"
  },
  "e.g. Regular shift hours": {
    "fr": "e.g. Regular Shift Heures",
    "ar": "e.g. Regular مناوبة ساعات",
    "es": "e.g. Regular Turno Horas"
  },
  "Cancel Series": {"fr": "Annuler la série", "ar": "إلغاء السلسلة", "es": "Cancelar serie"},
  "Cart empty": {"fr": "Panier vide", "ar": "السلة فارغة", "es": "Carrito vacío"},
  "COGS": {"fr": "COGS", "ar": "تكلفة البضاعة المباعة", "es": "COGS"},
  "e.g. Closing duties": {"fr": "ex. tâches de fermeture", "ar": "مثال: مهام الإغلاق", "es": "p. ej., tareas de cierre"},
  "HIIT": {"fr": "HIIT", "ar": "HIIT", "es": "HIIT"},
  "Margin": {"fr": "Marge", "ar": "الهامش", "es": "Margen"},
  "Member": {"fr": "Membre", "ar": "عضو", "es": "Miembro"},
  "Member Directory": {"fr": "Annuaire des membres", "ar": "دليل الأعضاء", "es": "Directorio de miembros"},
  "Member Discount": {"fr": "Remise membre", "ar": "خصم العضو", "es": "Descuento de miembro"},
  "Member ID:": {"fr": "ID membre :", "ar": "معرّف العضو:", "es": "ID de miembro:"},
  "Member screen PDFs": {"fr": "PDF de l’écran Membres", "ar": "ملفات PDF لشاشة الأعضاء", "es": "PDF de pantalla de miembros"},
  "Min. 6 characters": {"fr": "Min. 6 caractères", "ar": "6 أحرف على الأقل", "es": "Mín. 6 caracteres"},
  "Module": {"fr": "Module", "ar": "الوحدة", "es": "Módulo"},
  "Month": {"fr": "Mois", "ar": "الشهر", "es": "Mes"},
  "Monthly": {"fr": "Mensuel", "ar": "شهري", "es": "Mensual"},
  "Monthly Budget": {"fr": "Budget mensuel", "ar": "الميزانية الشهرية", "es": "Presupuesto mensual"},
  "Monthly Trend": {"fr": "Tendance mensuelle", "ar": "الاتجاه الشهري", "es": "Tendencia mensual"},
  "Morning HIIT": {"fr": "HIIT du matin", "ar": "HIIT صباحي", "es": "HIIT matutino"},
  "Net": {"fr": "Net", "ar": "الصافي", "es": "Neto"},
  "Net pay": {"fr": "Salaire net", "ar": "صافي الراتب", "es": "Pago neto"},
  "Net Profit": {"fr": "Bénéfice net", "ar": "صافي الربح", "es": "Beneficio neto"},
  "New Member": {"fr": "Nouveau membre", "ar": "عضو جديد", "es": "Nuevo miembro"},
  "Promise": {"fr": "Promesse", "ar": "وعد", "es": "Promesa"},
  "Provider": {"fr": "Fournisseur", "ar": "المزوّد", "es": "Proveedor"},
  "QR": {"fr": "QR", "ar": "QR", "es": "QR"},
  "Schedule Session(s)": {"fr": "Planifier session(s)", "ar": "جدولة الجلسة/الجلسات", "es": "Programar sesión(es)"},
  "Screen-specific filtered PDFs": {"fr": "PDF filtrés par écran", "ar": "ملفات PDF مفلترة حسب الشاشة", "es": "PDF filtrados por pantalla"},
  "Screen:": {"fr": "Écran :", "ar": "الشاشة:", "es": "Pantalla:"},
  "Section PDFs": {"fr": "PDF de section", "ar": "ملفات PDF للأقسام", "es": "PDF de sección"},
  "Webcam QR Reader": {"fr": "Lecteur QR webcam", "ar": "قارئ QR بالكاميرا", "es": "Lector QR con webcam"},
  "WhatsApp PDF": {"fr": "PDF WhatsApp", "ar": "PDF عبر واتساب", "es": "PDF por WhatsApp"},
};

// Phase 12 manual terminology overrides. Keep these separate from the generated map so
// TypeScript can reject accidental duplicate keys inside each object while intentional
// terminology refinements safely override the generated dictionary at merge time.
const phase12ManualTerminologyOverrideEntries: Array<[string, ExpandedStaticTextTranslations]> = [
  ["API Cache", {"fr": "Cache API", "ar": "ذاكرة API المؤقتة", "es": "Caché de API"}],
  ["Access Denials", {"fr": "Refus d’accès", "ar": "رفض الوصول", "es": "Denegaciones de acceso"}],
  ["Access Denied", {"fr": "Accès refusé", "ar": "تم رفض الوصول", "es": "Acceso denegado"}],
  ["Access Granted", {"fr": "Accès autorisé", "ar": "تم السماح بالوصول", "es": "Acceso concedido"}],
  ["Access eCard", {"fr": "Accès e‑carte", "ar": "الوصول إلى البطاقة الإلكترونية", "es": "Acceso a e‑card"}],
  ["Accessed on date", {"fr": "Consulté à cette date", "ar": "تم الوصول في التاريخ", "es": "Accedido en la fecha"}],
  ["Accounting & Finance", {"fr": "Comptabilité et finance", "ar": "المحاسبة والمالية", "es": "Contabilidad y finanzas"}],
  ["Action Frequency (Last 7 Days)", {"fr": "Fréquence des actions (7 derniers jours)", "ar": "تكرار الإجراءات (آخر 7 أيام)", "es": "Frecuencia de acciones (últimos 7 días)"}],
  ["Active employees", {"fr": "Employés actifs", "ar": "الموظفون النشطون", "es": "Empleados activos"}],
  ["Active Members", {"fr": "Membres actifs", "ar": "الأعضاء النشطون", "es": "Miembros activos"}],
  ["Active Plans", {"fr": "Abonnements actifs", "ar": "الخطط النشطة", "es": "Planes activos"}],
  ["Active Subscriptions", {"fr": "Abonnements actifs", "ar": "الاشتراكات النشطة", "es": "Suscripciones activas"}],
  ["Affected Rows", {"fr": "Lignes affectées", "ar": "الصفوف المتأثرة", "es": "Filas afectadas"}],
  ["All Logs", {"fr": "Tous les journaux", "ar": "كل السجلات", "es": "Todos los registros"}],
  ["All Roles", {"fr": "Tous les rôles", "ar": "كل الأدوار", "es": "Todos los roles"}],
  ["All categories", {"fr": "Toutes les catégories", "ar": "كل الفئات", "es": "Todas las categorías"}],
  ["All statuses", {"fr": "Tous les statuts", "ar": "كل الحالات", "es": "Todos los estados"}],
  ["All trainers", {"fr": "Tous les coachs", "ar": "كل المدربين", "es": "Todos los entrenadores"}],
  ["Auto-print receipt", {"fr": "Impression automatique du reçu", "ar": "طباعة الإيصال تلقائيًا", "es": "Impresión automática de recibo"}],
  ["Avg API", {"fr": "API moyenne", "ar": "متوسط API", "es": "API promedio"}],
  ["Avg Duration", {"fr": "Durée moyenne", "ar": "متوسط المدة", "es": "Duración promedio"}],
  ["Avg. Fulfillment Time", {"fr": "Délai moyen d’exécution", "ar": "متوسط وقت التنفيذ", "es": "Tiempo promedio de cumplimiento"}],
  ["Barcode Scanner", {"fr": "Scanner de code-barres", "ar": "ماسح الباركود", "es": "Escáner de código de barras"}],
  ["Category fallback", {"fr": "Catégorie par défaut", "ar": "فئة بديلة", "es": "Categoría de respaldo"}],
  ["Clear Cache", {"fr": "Vider le cache", "ar": "مسح الذاكرة المؤقتة", "es": "Borrar caché"}],
  ["Client (Revoke access)", {"fr": "Client (révoquer l’accès)", "ar": "العميل (إلغاء الوصول)", "es": "Cliente (revocar acceso)"}],
  ["Current background preview", {"fr": "Aperçu de l’arrière-plan actuel", "ar": "معاينة الخلفية الحالية", "es": "Vista previa del fondo actual"}],
  ["e-Card Note", {"fr": "Note de l’e‑carte", "ar": "ملاحظة البطاقة الإلكترونية", "es": "Nota de e‑card"}],
  ["e-Card Title", {"fr": "Titre de l’e‑carte", "ar": "عنوان البطاقة الإلكترونية", "es": "Título de e‑card"}],
  ["e.g. Regular shift hours", {"fr": "ex. horaires de shift réguliers", "ar": "مثال: ساعات المناوبة العادية", "es": "p. ej., horario de turno regular"}],
  ["End Time", {"fr": "Heure de fin", "ar": "وقت الانتهاء", "es": "Hora de fin"}],
  ["First name", {"fr": "Prénom", "ar": "الاسم الأول", "es": "Nombre"}],
  ["First Name", {"fr": "Prénom", "ar": "الاسم الأول", "es": "Nombre"}],
  ["Full address", {"fr": "Adresse complète", "ar": "العنوان الكامل", "es": "Dirección completa"}],
  ["Last name", {"fr": "Nom", "ar": "اسم العائلة", "es": "Apellido"}],
  ["Last Name", {"fr": "Nom", "ar": "اسم العائلة", "es": "Apellido"}],
  ["Loading details", {"fr": "Chargement des détails", "ar": "جار تحميل التفاصيل", "es": "Cargando detalles"}],
  ["No address", {"fr": "Aucune adresse", "ar": "لا يوجد عنوان", "es": "Sin dirección"}],
  ["No phone", {"fr": "Aucun téléphone", "ar": "لا يوجد هاتف", "es": "Sin teléfono"}],
  ["No supplier", {"fr": "Aucun fournisseur", "ar": "لا يوجد مورد", "es": "Sin proveedor"}],
  ["Open purchase exposure:", {"fr": "Exposition d’achat ouverte :", "ar": "التعرض المفتوح للمشتريات:", "es": "Exposición de compra abierta:"}],
  ["Price tier: Member", {"fr": "Niveau tarifaire : membre", "ar": "فئة السعر: عضو", "es": "Nivel de precio: miembro"}],
  ["Rooms / Locations (comma separated)", {"fr": "Salles / lieux (séparés par des virgules)", "ar": "الغرف / المواقع (مفصولة بفواصل)", "es": "Salas / ubicaciones (separadas por comas)"}],
  ["Sales, Management, Training...", {"fr": "Ventes, gestion, formation...", "ar": "المبيعات، الإدارة، التدريب...", "es": "Ventas, gestión, entrenamiento..."}],
  ["Personal Training Area, Sala A, Sala B...", {"fr": "Zone d’entraînement personnel, salle A, salle B...", "ar": "منطقة التدريب الشخصي، قاعة أ، قاعة ب...", "es": "Área de entrenamiento personal, Sala A, Sala B..."}],
  ["Search staff, phone, role, or shifts by name...", {"fr": "Rechercher le personnel, téléphone, rôle ou shifts par nom...", "ar": "ابحث بالاسم عن الموظفين أو الهاتف أو الدور أو المناوبات...", "es": "Buscar por nombre en personal, teléfono, rol o turnos..."}],
  ["Start Webcam Scan", {"fr": "Démarrer le scan webcam", "ar": "بدء المسح بالكاميرا", "es": "Iniciar escaneo con webcam"}],
  ["Stop Camera", {"fr": "Arrêter la caméra", "ar": "إيقاف الكاميرا", "es": "Detener cámara"}],
  ["Tax (8.5%)", {"fr": "Taxe (8,5 %)", "ar": "الضريبة (8.5%)", "es": "Impuesto (8,5 %)"}],
  ["TOTAL", {"fr": "TOTAL", "ar": "الإجمالي", "es": "TOTAL"}],
  ["Warehouse data error", {"fr": "Erreur de données d’entrepôt", "ar": "خطأ في بيانات المستودع", "es": "Error de datos de almacén"}],
  ["Warnings/Errors", {"fr": "Avertissements/erreurs", "ar": "التحذيرات/الأخطاء", "es": "Advertencias/errores"}],
];

const phase12ManualTerminologyOverrides = Object.fromEntries(
  phase12ManualTerminologyOverrideEntries,
) as Record<string, ExpandedStaticTextTranslations>;
export const expandedStaticTextTranslations: Record<string, ExpandedStaticTextTranslations> = {
  ...generatedExpandedStaticTextTranslations,
  ...phase12ManualTerminologyOverrides,
};

export const localizationAuditExceptions = [
  "Assaf IT Consulting & Support",
  "FitAdmin Systems",
  "PowerGym Management",
  "PowerGym Management system",
  "admin, reception, trainer...",
  "admin@example.com",
  "e.g. Iron Forge Gym",
  "void | Promise"
] as const;
