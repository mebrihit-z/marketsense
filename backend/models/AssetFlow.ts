import mongoose, { Document, Schema } from 'mongoose';

export interface IAssetFlow extends Document {
  modelRunDate: Date;
  modelVersion: string;
  investorRegion: string;
  investorTypes: string;
  planType: string;
  secType: string;
  productRegion: string;
  productType: string;
  productSubType: string;
  assetFlowDate: string;
  assetFlowValue: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const AssetFlowSchema: Schema = new Schema({
  modelRunDate: {
    type: Date,
    required: true,
    index: true
  },
  modelVersion: {
    type: String,
    required: true,
    index: true
  },
  investorRegion: {
    type: String,
    required: true,
    index: true
  },
  investorTypes: {
    type: String,
    required: true,
    index: true
  },
  planType: {
    type: String,
    required: true
  },
  secType: {
    type: String,
    required: true
  },
  productRegion: {
    type: String,
    required: true,
    index: true
  },
  productType: {
    type: String,
    required: true,
    index: true
  },
  productSubType: {
    type: String,
    required: true,
    index: true
  },
  assetFlowDate: {
    type: String,
    required: true,
    index: true
  },
  assetFlowValue: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
AssetFlowSchema.index({ investorRegion: 1, productType: 1, assetFlowDate: 1 });
AssetFlowSchema.index({ productType: 1, productSubType: 1 });
AssetFlowSchema.index({ assetFlowDate: 1, assetFlowValue: 1 });

const AssetFlow = mongoose.model<IAssetFlow>('AssetFlow', AssetFlowSchema);

export default AssetFlow;

