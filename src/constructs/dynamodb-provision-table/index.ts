// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { CustomResource, Duration, Stack } from 'aws-cdk-lib';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Policy } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Code, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { LambdaConfiguration } from '../../types';
import { SecureFunction } from '../secure-function';
import { ResourceProperties } from './handler/types/resource-properties';

/**
 * Properties for the DynamoDBProvisionTable construct.
 */
export interface DynamoDBProvisionTableProps {
    /**
     * Table to provision
     */
    readonly table: DynamoDBProvisionTable.TableProps;

    /**
     * Items to provision within the DynamoDB table
     */
    readonly items: Record<string, unknown>[];

    /**
     * Encryption key for protecting the framework resources
     */
    readonly encryption?: IKey;

    /**
     * Optional Lambda configuration settings.
     */
    readonly lambdaConfiguration?: LambdaConfiguration;
}

/**
 * Manages provisioning a DynamoDB table
 */
export class DynamoDBProvisionTable extends Construct {
    /**
     * Mapping of providers for each CDK stack
     * Used to ensure only one provider is created per stack
     */
    private static serviceTokens = new Map<string, Provider>();

    /**
     * Builds the provider to support the Custom Resource
     *
     * @param scope Parent to which the Custom Resource belongs
     * @param props Metadata for configuring the Custom Resource
     *
     * @returns Provider for the worker
     */
    private static getOrBuildProvider(
        scope: Construct,
        props: DynamoDBProvisionTableProps
    ): Provider {
        const stackId = Stack.of(scope).node.id;

        if (!DynamoDBProvisionTable.serviceTokens.has(stackId)) {
            // Create a stack level construct to manage the framework
            const provider = new Construct(
                scope,
                `Cr${DynamoDBProvisionTable.name}`
            );

            const onEventHandler = new SecureFunction(provider, 'OnEvent', {
                code: Code.fromAsset(join(__dirname, 'handler', 'on-event')),
                handler: 'index.handler',
                memorySize: 512,
                timeout: Duration.minutes(1),
                runtime: Runtime.NODEJS_22_X,
                encryption: props.encryption,
                ...props.lambdaConfiguration
            });

            DynamoDBProvisionTable.serviceTokens.set(
                stackId,
                new Provider(provider, 'Provider', {
                    onEventHandler: onEventHandler.function
                })
            );
        }

        return DynamoDBProvisionTable.serviceTokens.get(stackId)!;
    }

    /**
     * Translates the CDK construct properties to the Custom Resource
     * property format
     * @param props Metadata for configuring the Custom Resource
     * @returns Input for the actual Custom Resource worker
     */
    private static createCustomResourceProperties(
        props: DynamoDBProvisionTableProps
    ): ResourceProperties {
        return {
            Items: props.items,
            PartitionKeyName: props.table.partitionKeyName,
            TableName: props.table.resource.tableName,
            SortKeyName: props.table.sortKeyName
        };
    }

    /**
     * Provisions an existing DynamoDB Table with user-specified data
     * @param scope Parent to which the Custom Resource belongs
     * @param id Unique identifier for this instance
     * @param props Metadata for configuring the Custom Resource
     */
    constructor(
        scope: Construct,
        id: string,
        props: DynamoDBProvisionTableProps
    ) {
        super(scope, id);

        const provider = DynamoDBProvisionTable.getOrBuildProvider(
            scope,
            props
        );

        // Create permissions as a separate policy to ensure in DELETEs they are not removed until after the CR has run
        const providerPermissions = new Policy(this, 'Permissions');

        props.table.resource.grantReadWriteData(providerPermissions);

        if (props.table.encryption) {
            props.table.encryption.grantEncryptDecrypt(providerPermissions);
        }

        provider.onEventHandler.role!.attachInlinePolicy(providerPermissions);

        new CustomResource(this, 'DynamoDBProvisionTable', {
            serviceToken: provider.serviceToken,
            properties:
                DynamoDBProvisionTable.createCustomResourceProperties(props),
            resourceType: 'Custom::DynamoDBProvisionTable'
        });
    }
}

export namespace DynamoDBProvisionTable {
    /**
     * Information about the table to provision
     */
    export interface TableProps {
        /**
         * CDK representation of the table itself
         */
        readonly resource: ITable;

        /**
         * Name of the partition key for the table
         */
        readonly partitionKeyName: string;

        /**
         * Name of the sort key for the table if applicable
         */
        readonly sortKeyName?: string;

        /**
         * Optional existing encryption key associated with the table
         */
        readonly encryption?: IKey;
    }
}
