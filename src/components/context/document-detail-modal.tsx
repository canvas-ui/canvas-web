import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Document {
  id: number;
  schema: string;
  schemaVersion: string;
  data: any;
  metadata: {
    contentType: string;
    contentEncoding: string;
    dataPaths: string[];
  };
  indexOptions: {
    checksumAlgorithms: string[];
    primaryChecksumAlgorithm: string;
    checksumFields: string[];
    ftsSearchFields: string[];
    vectorEmbeddingFields: string[];
    embeddingOptions: {
      embeddingModel: string;
      embeddingDimensions: number;
      embeddingProvider: string;
      embeddingProviderOptions: Record<string, any>;
      chunking: {
        type: string;
        chunkSize: number;
        chunkOverlap: number;
      };
    };
  };
  createdAt: string;
  updatedAt: string;
  checksumArray: string[];
  embeddingsArray: any[];
  parentId: string | null;
  versions: any[];
  versionNumber: number;
  latestVersion: number;
}

interface DocumentDetailModalProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentDetailModal({ document, isOpen, onClose }: DocumentDetailModalProps) {
  const [showRawJson, setShowRawJson] = useState(false);
  if (!isOpen || !document) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">Document Details</h2>
              <p className="text-muted-foreground">ID: {document.id}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowRawJson(v => !v)}
                variant="outline"
                size="sm"
                title="Toggle raw JSON view"
              >
                {showRawJson ? 'View Data' : 'View Raw JSON'}
              </Button>
              <Button
                onClick={onClose}
                variant="ghost"
                size="sm"
                className="p-2"
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-6">
            {/* Basic Info */}
            <div>
              <h3 className="font-semibold mb-3">Basic Information</h3>
              <div className="grid gap-3 text-sm">
                <div>
                  <span className="font-medium">Schema:</span>
                  <span className="ml-2 font-mono">{document.schema}</span>
                </div>
                <div>
                  <span className="font-medium">Version:</span>
                  <span className="ml-2">{document.versionNumber} / {document.latestVersion}</span>
                </div>
                <div>
                  <span className="font-medium">Created:</span>
                  <span className="ml-2">{formatDate(document.createdAt)}</span>
                </div>
                <div>
                  <span className="font-medium">Updated:</span>
                  <span className="ml-2">{formatDate(document.updatedAt)}</span>
                </div>
              </div>
            </div>

            {/* Document Data */}
            <div>
              <h3 className="font-semibold mb-3">{showRawJson ? 'Raw Document JSON' : 'Document Data'}</h3>
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                {JSON.stringify(showRawJson ? document : document.data, null, 2)}
              </pre>
            </div>

            {/* Locations */}
            {Array.isArray((document as any).locations) && (document as any).locations.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">Locations</h3>
                <div className="space-y-1">
                  {(document as any).locations.map((loc: any, index: number) => (
                    <div key={index} className="font-mono text-xs text-muted-foreground">{loc?.url ?? JSON.stringify(loc)}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Checksums */}
            {Array.isArray(document.checksumArray) && document.checksumArray.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">Checksums</h3>
                <div className="space-y-2">
                  {document.checksumArray.map((checksum, index) => {
                    const [algo, hash] = checksum.split('/');
                    return (
                      <div key={index} className="flex items-center gap-2 text-sm font-mono">
                        <span className="font-medium">{algo}:</span>
                        <span className="text-muted-foreground">{hash}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t flex justify-end">
            <Button
              onClick={onClose}
              className="px-4 py-2"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
