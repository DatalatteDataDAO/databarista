# Plugin DataDAO Changes

## Overview
This plugin was created by copying `plugin-bootstrap` and making it leaner for DataDAO applications.

## Changes Made

### Actions
- **Kept only 3 actions**: `ignore`, `none`, `reply`
- **Removed all other actions**: choice, followRoom, imageGeneration, muteRoom, roles, sendMessage, settings, unfollowRoom, unmuteRoom, updateEntity

### Evaluators
- **Updated reflection evaluator** to focus on persona insights using PEACOCK framework
- **Removed connection insights** (not applicable for DataDAO)
- **Added persona-focused reflection** that extracts user insights across 7 dimensions:
  - demographic
  - characteristic
  - routine
  - goal
  - experience
  - persona_relationship
  - emotional_state

### Providers
- **Added personaMemoryProvider** for retrieving persona insights using PEACOCK framework
- **Searches across persona dimension tables** for relevant user insights
- **Provides context** for conversations based on learned persona data

### Utils
- **Added utils folder** with custom prompt templates
- **Local messageHandlerTemplate** customized for DataDAO applications
- **Focused on data-driven insights** and persona understanding

### Plugin Configuration
- **Name**: `datadao`
- **Description**: DataDAO plugin with essential actions and evaluators
- **Lean architecture** focused on core functionality

## Usage
This plugin provides the minimal set of actions needed for DataDAO agents while adding sophisticated persona understanding capabilities through the PEACOCK framework. The custom messageHandlerTemplate focuses on data-driven insights and building comprehensive user persona profiles.