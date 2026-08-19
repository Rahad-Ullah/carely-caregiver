import { Router } from 'express';
import { USER_ROLES } from '../../../enums/user';
import { checkAuth } from '../../middlewares/checkAuth';
import validateRequest from '../../middlewares/validateRequest';
import fileUploadHandler from '../../middlewares/fileUploadHandler';
import { CategoryController } from './category.controller';
import { CategoryValidation } from './category.validation';

const router = Router();

router.get('/active', CategoryController.getActiveCategories);

router.post(
  '/',
  checkAuth(USER_ROLES.ADMIN),
  fileUploadHandler,
  validateRequest(CategoryValidation.create),
  CategoryController.createCategory
);

router.get('/', checkAuth(), CategoryController.getAllCategories);

router.get('/:id', checkAuth(USER_ROLES.ADMIN), CategoryController.getCategoryById);

router.patch(
  '/:id',
  checkAuth(USER_ROLES.ADMIN),
  fileUploadHandler,
  validateRequest(CategoryValidation.update),
  CategoryController.updateCategory
);

router.patch('/:id/toggle', checkAuth(USER_ROLES.ADMIN), CategoryController.toggleStatus);

router.delete('/:id', checkAuth(USER_ROLES.ADMIN), CategoryController.deleteCategory);

export const CategoryRoutes = router;