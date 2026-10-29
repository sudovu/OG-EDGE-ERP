import { Router } from "express";
import { authRouter } from "../modules/auth/auth.routes";
import { organizationsRouter } from "../modules/organizations/organizations.routes";
import { usersRouter } from "../modules/users/users.routes";
import { catalogRouter } from "../modules/catalog/catalog.routes";
import { customersRouter } from "../modules/customers/customers.routes";
import { suppliersRouter } from "../modules/suppliers/suppliers.routes";
import { inventoryRouter } from "../modules/inventory/inventory.routes";
import { salesRouter } from "../modules/sales/sales.routes";
import { purchasingRouter } from "../modules/purchasing/purchasing.routes";
import { servicesRouter } from "../modules/services/services.routes";
import { accountingRouter } from "../modules/accounting/accounting.routes";
import { workflowsRouter } from "../modules/workflows/workflows.routes";
import { reportsRouter } from "../modules/reports/reports.routes";
import { integrationsRouter } from "../modules/integrations/integrations.routes";

const router = Router();

router.use(authRouter);
router.use(organizationsRouter);
router.use(usersRouter);
router.use(catalogRouter);
router.use(customersRouter);
router.use(suppliersRouter);
router.use(inventoryRouter);
router.use(salesRouter);
router.use(purchasingRouter);
router.use(servicesRouter);
router.use(accountingRouter);
router.use(workflowsRouter);
router.use(reportsRouter);
router.use(integrationsRouter);

export const apiRouter = router;

