import express, { Router } from 'express';
import {
  getAllAssetFlows,
  getAssetFlowById,
  getAssetFlowStats,
  getFlowsByDimension,
  createAssetFlow,
  updateAssetFlow,
  deleteAssetFlow
} from '../controllers/assetFlowController.js';

const router: Router = express.Router();

// Statistics and aggregated routes
router.get('/stats', getAssetFlowStats);
router.get('/dimension/:dimension', getFlowsByDimension);
router.get('/dimension/:dimension/:groupBy', getFlowsByDimension);

// CRUD routes
router.route('/')
  .get(getAllAssetFlows)
  .post(createAssetFlow);

router.route('/:id')
  .get(getAssetFlowById)
  .put(updateAssetFlow)
  .delete(deleteAssetFlow);

export default router;

