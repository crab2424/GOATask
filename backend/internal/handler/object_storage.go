package handler

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/crab2424/goatask/backend/internal/config"
	"github.com/oracle/oci-go-sdk/v65/common"
	"github.com/oracle/oci-go-sdk/v65/common/auth"
	"github.com/oracle/oci-go-sdk/v65/objectstorage"
)

type ObjectStorage struct {
	client    objectstorage.ObjectStorageClient
	namespace string
	bucket    string
	region    string
}

func NewObjectStorage(cfg *config.Config) (*ObjectStorage, error) {
	var provider common.ConfigurationProvider
	if cfg.OCIAuthMethod == "instance_principal" {
		p, err := auth.InstancePrincipalConfigurationProvider()
		if err != nil {
			return nil, fmt.Errorf("initialize OCI instance principal auth: %w", err)
		}
		provider = p
	} else {
		provider = common.DefaultConfigProvider()
	}
	client, err := objectstorage.NewObjectStorageClientWithConfigurationProvider(provider)
	if err != nil {
		return nil, fmt.Errorf("initialize OCI Object Storage client: %w", err)
	}
	client.SetRegion(cfg.OCIRegion)
	return &ObjectStorage{client: client, namespace: cfg.OCIObjectStorageNamespace, bucket: cfg.OCIBucketName, region: cfg.OCIRegion}, nil
}

func (s *ObjectStorage) Put(ctx context.Context, objectName string, body io.ReadCloser, size int64, contentType string) (string, error) {
	response, err := s.client.PutObject(ctx, objectstorage.PutObjectRequest{
		NamespaceName: &s.namespace,
		BucketName:    &s.bucket,
		ObjectName:    &objectName,
		ContentLength: &size,
		PutObjectBody: body,
		ContentType:   &contentType,
		IfNoneMatch:   common.String("*"),
	})
	if err != nil {
		return "", err
	}
	if response.ETag == nil {
		return "", nil
	}
	return *response.ETag, nil
}

func (s *ObjectStorage) Delete(ctx context.Context, objectName string) error {
	_, err := s.client.DeleteObject(ctx, objectstorage.DeleteObjectRequest{
		NamespaceName: &s.namespace,
		BucketName:    &s.bucket,
		ObjectName:    &objectName,
	})
	return err
}

func (s *ObjectStorage) CreateReadShare(ctx context.Context, objectName string, expiresAt time.Time, name string) (string, string, error) {
	response, err := s.client.CreatePreauthenticatedRequest(ctx, objectstorage.CreatePreauthenticatedRequestRequest{
		NamespaceName: &s.namespace,
		BucketName:    &s.bucket,
		CreatePreauthenticatedRequestDetails: objectstorage.CreatePreauthenticatedRequestDetails{
			Name:        &name,
			AccessType:  objectstorage.CreatePreauthenticatedRequestDetailsAccessTypeObjectread,
			TimeExpires: &common.SDKTime{Time: expiresAt},
			ObjectName:  &objectName,
		},
	})
	if err != nil {
		return "", "", err
	}
	if response.PreauthenticatedRequest.AccessUri == nil || response.PreauthenticatedRequest.Id == nil {
		return "", "", fmt.Errorf("OCI returned incomplete pre-authenticated request")
	}
	return fmt.Sprintf("https://objectstorage.%s.oraclecloud.com%s", s.region, *response.PreauthenticatedRequest.AccessUri), *response.PreauthenticatedRequest.Id, nil
}

func (s *ObjectStorage) DeleteReadShare(ctx context.Context, parID string) error {
	if parID == "" {
		return nil
	}
	_, err := s.client.DeletePreauthenticatedRequest(ctx, objectstorage.DeletePreauthenticatedRequestRequest{
		NamespaceName: &s.namespace,
		BucketName:    &s.bucket,
		ParId:         &parID,
	})
	return err
}
