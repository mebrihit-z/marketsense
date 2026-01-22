import { Request, Response } from 'express';
import type { PipelineStage } from 'mongoose';
import AssetFlow from '../models/AssetFlow.js';

// Get all asset flows with optional filters
export const getAllAssetFlows = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      investorRegion,
      investorTypes,
      productType,
      productSubType,
      productRegion,
      assetFlowDate,
      modelVersion,
      page = '1',
      limit = '100',
      sortBy = 'assetFlowDate',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter: Record<string, string> = {};
    if (investorRegion) filter.investorRegion = investorRegion as string;
    if (investorTypes) filter.investorTypes = investorTypes as string;
    if (productType) filter.productType = productType as string;
    if (productSubType) filter.productSubType = productSubType as string;
    if (productRegion) filter.productRegion = productRegion as string;
    if (assetFlowDate) filter.assetFlowDate = assetFlowDate as string;
    if (modelVersion) filter.modelVersion = modelVersion as string;

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;
    const sort: Record<string, 1 | -1> = { [sortBy as string]: sortOrder === 'desc' ? -1 : 1 };

    // Execute query
    const [data, total] = await Promise.all([
      AssetFlow.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AssetFlow.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      count: data.length,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
};

// Get asset flow by ID
export const getAssetFlowById = async (req: Request, res: Response): Promise<void> => {
  try {
    const assetFlow = await AssetFlow.findById(req.params.id);

    if (!assetFlow) {
      res.status(404).json({
        success: false,
        error: 'Asset flow not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: assetFlow
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
};

// Get aggregated statistics
export const getAssetFlowStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      investorRegion,
      investorTypes,
      productType,
      productSubType,
      productRegion,
      assetFlowDate,
      modelVersion
    } = req.query;

    // Build filter object
    const filter: Record<string, string> = {};
    if (investorRegion) filter.investorRegion = investorRegion as string;
    if (investorTypes) filter.investorTypes = investorTypes as string;
    if (productType) filter.productType = productType as string;
    if (productSubType) filter.productSubType = productSubType as string;
    if (productRegion) filter.productRegion = productRegion as string;
    if (assetFlowDate) filter.assetFlowDate = assetFlowDate as string;
    if (modelVersion) filter.modelVersion = modelVersion as string;

    const stats = await AssetFlow.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          totalInflow: {
            $sum: {
              $cond: [{ $gt: ['$assetFlowValue', 0] }, '$assetFlowValue', 0]
            }
          },
          totalOutflow: {
            $sum: {
              $cond: [{ $lt: ['$assetFlowValue', 0] }, '$assetFlowValue', 0]
            }
          },
          netFlow: { $sum: '$assetFlowValue' },
          avgFlow: { $avg: '$assetFlowValue' },
          minFlow: { $min: '$assetFlowValue' },
          maxFlow: { $max: '$assetFlowValue' }
        }
      }
    ]);

    // Get unique values for filters
    const [investorRegions, investorTypesList, productTypes, productSubTypes, productRegions, flowDates] = await Promise.all([
      AssetFlow.distinct('investorRegion', filter),
      AssetFlow.distinct('investorTypes', filter),
      AssetFlow.distinct('productType', filter),
      AssetFlow.distinct('productSubType', filter),
      AssetFlow.distinct('productRegion', filter),
      AssetFlow.distinct('assetFlowDate', filter).sort()
    ]);

    res.status(200).json({
      success: true,
      stats: stats[0] || {
        totalRecords: 0,
        totalInflow: 0,
        totalOutflow: 0,
        netFlow: 0,
        avgFlow: 0,
        minFlow: 0,
        maxFlow: 0
      },
      filterOptions: {
        investorRegions,
        investorTypes: investorTypesList,
        productTypes,
        productSubTypes,
        productRegions,
        assetFlowDates: flowDates
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
};

// Get aggregated flows by dimension
export const getFlowsByDimension = async (req: Request, res: Response): Promise<void> => {
  try {
    const { dimension, groupBy } = req.params;
    const { assetFlowDate, modelVersion } = req.query;

    const filter: Record<string, string> = {};
    if (assetFlowDate) filter.assetFlowDate = assetFlowDate as string;
    if (modelVersion) filter.modelVersion = modelVersion as string;

    // Valid dimensions
    const validDimensions = [
      'investorRegion',
      'investorTypes',
      'productType',
      'productSubType',
      'productRegion',
      'planType',
      'secType'
    ];

    if (!validDimensions.includes(dimension)) {
      res.status(400).json({
        success: false,
        error: `Invalid dimension. Must be one of: ${validDimensions.join(', ')}`
      });
      return;
    }

    const groupField = groupBy && validDimensions.includes(groupBy) ? groupBy : null;

    if (groupField) {
      // Group by two dimensions
      const pipeline: PipelineStage[] = [
        { $match: filter },
        {
          $group: {
            _id: {
              [dimension]: `$${dimension}`,
              [groupField]: `$${groupField}`
            },
            totalFlow: { $sum: '$assetFlowValue' },
            count: { $sum: 1 },
            avgFlow: { $avg: '$assetFlowValue' }
          }
        },
        { $sort: { totalFlow: -1 as const } }
      ];

      const results = await AssetFlow.aggregate(pipeline);

      res.status(200).json({
        success: true,
        dimension,
        groupBy: groupField,
        data: results
      });
    } else {
      // Group by single dimension
      const pipeline: PipelineStage[] = [
        { $match: filter },
        {
          $group: {
            _id: `$${dimension}`,
            totalFlow: { $sum: '$assetFlowValue' },
            count: { $sum: 1 },
            avgFlow: { $avg: '$assetFlowValue' },
            minFlow: { $min: '$assetFlowValue' },
            maxFlow: { $max: '$assetFlowValue' }
          }
        },
        { $sort: { totalFlow: -1 as const } }
      ];

      const results = await AssetFlow.aggregate(pipeline);

      res.status(200).json({
        success: true,
        dimension,
        data: results
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
};

// Create new asset flow
export const createAssetFlow = async (req: Request, res: Response): Promise<void> => {
  try {
    const assetFlow = await AssetFlow.create(req.body);
    res.status(201).json({
      success: true,
      data: assetFlow
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({
      success: false,
      error: errorMessage
    });
  }
};

// Update asset flow
export const updateAssetFlow = async (req: Request, res: Response): Promise<void> => {
  try {
    const assetFlow = await AssetFlow.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!assetFlow) {
      res.status(404).json({
        success: false,
        error: 'Asset flow not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: assetFlow
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({
      success: false,
      error: errorMessage
    });
  }
};

// Delete asset flow
export const deleteAssetFlow = async (req: Request, res: Response): Promise<void> => {
  try {
    const assetFlow = await AssetFlow.findByIdAndDelete(req.params.id);

    if (!assetFlow) {
      res.status(404).json({
        success: false,
        error: 'Asset flow not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
};

